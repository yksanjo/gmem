/**
 * Hardhat workspace auto-ingest — Milestone v1.1 (EVM analogue of anchor.ts).
 *
 * Walks a Hardhat project, reads each deployment artifact written by the
 * `hardhat-deploy` plugin (`deployments/<network>/<name>.json`), and builds
 * a `Contract` entity per (chain, address) pair with an ABI sha256.
 *
 * The hardhat-deploy convention is the dominant pattern for production
 * deployments across the EVM ecosystem — used by Synthetix, Optimism, Base
 * tutorials, etc. Falls back gracefully when artifacts are missing.
 *
 * No network calls. No private-key access.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export interface IngestedContract {
  address: string;
  chain: string;
  chainId?: number;
  name: string;
  abiHash?: string;
  sourceCommit?: string;
  txHash?: string;
}

export interface HardhatIngestReport {
  projectRoot: string;
  configPath: string;
  contracts: IngestedContract[];
  sourceCommit?: string;
  warnings: string[];
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Network name → canonical chain id + chain slug
 * ───────────────────────────────────────────────────────────────────────── */

interface ChainSpec {
  chain: string;
  chainId: number;
}

/**
 * Hardhat networks are named by the developer (e.g. `mainnet`, `base`,
 * `optimismGoerli`). We classify the most common ones into canonical
 * (chain, chainId) pairs. Unknown names pass through as a custom slug
 * so the schema's permissive `chain` pattern accepts them.
 */
const NETWORK_TABLE: Array<{ pattern: RegExp; spec: ChainSpec }> = [
  // Ethereum
  { pattern: /^(mainnet|ethereum|eth(-?mainnet)?)$/i, spec: { chain: "ethereum-mainnet", chainId: 1 } },
  { pattern: /^sepolia$/i,                              spec: { chain: "ethereum-sepolia", chainId: 11155111 } },
  { pattern: /^holesky$/i,                              spec: { chain: "ethereum-holesky", chainId: 17000 } },
  // Base
  { pattern: /^base(-mainnet)?$/i,                      spec: { chain: "base-mainnet",     chainId: 8453 } },
  { pattern: /^base(-?sepolia|-?goerli)$/i,             spec: { chain: "base-sepolia",     chainId: 84532 } },
  // Optimism
  { pattern: /^(optimism|op|op-?mainnet)$/i,            spec: { chain: "optimism-mainnet", chainId: 10 } },
  { pattern: /^op-?(sepolia|goerli)$/i,                 spec: { chain: "optimism-sepolia", chainId: 11155420 } },
  // Polygon
  { pattern: /^(polygon|matic|polygon-?mainnet)$/i,     spec: { chain: "polygon-mainnet",  chainId: 137 } },
  { pattern: /^(polygon-?amoy|amoy)$/i,                 spec: { chain: "polygon-amoy",     chainId: 80002 } },
  // Arbitrum
  { pattern: /^(arbitrum|arbitrum-?one|arb)$/i,         spec: { chain: "arbitrum-one",     chainId: 42161 } },
  { pattern: /^arbitrum-?sepolia$/i,                    spec: { chain: "arbitrum-sepolia", chainId: 421614 } },
  // zkSync + Scroll
  { pattern: /^(zksync|zksync-?era)$/i,                 spec: { chain: "zksync-era",       chainId: 324 } },
  { pattern: /^scroll(-?mainnet)?$/i,                   spec: { chain: "scroll-mainnet",   chainId: 534352 } },
];

function classifyNetwork(networkDir: string): ChainSpec {
  for (const { pattern, spec } of NETWORK_TABLE) {
    if (pattern.test(networkDir)) return spec;
  }
  // Custom / unknown: slugify into the schema's permissive pattern.
  const slug = networkDir
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "evm-unknown";
  return { chain: slug, chainId: 0 };
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Discovery
 * ───────────────────────────────────────────────────────────────────────── */

const HARDHAT_CONFIGS = ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs"];

/** Walk up from `start` looking for a hardhat.config.{ts,js,cjs,mjs} file. */
export function findHardhatRoot(start: string): { root: string; configPath: string } | null {
  let dir = resolve(start);
  while (true) {
    for (const name of HARDHAT_CONFIGS) {
      const p = resolve(dir, name);
      if (existsSync(p)) return { root: dir, configPath: p };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readGitHead(projectRoot: string): string | undefined {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return /^[a-f0-9]{7,40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Canonicalize an ABI for stable hashing. Sorts top-level array entries by
 * a deterministic key (type + name + parameter type list) so reordering
 * doesn't change the hash. Then JSON.stringify with sorted object keys
 * (recursively) so nested object key order also doesn't matter.
 */
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys) out[k] = canonicalJson((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

function canonicalAbiJson(abi: unknown): string {
  if (!Array.isArray(abi)) return JSON.stringify(canonicalJson(abi));
  const abiArray = abi as Record<string, unknown>[];
  const sortKey = (e: Record<string, unknown>): string => {
    const inputs = Array.isArray(e.inputs) ? (e.inputs as { type?: string }[]).map((i) => i.type ?? "").join(",") : "";
    return `${String(e.type ?? "")}:${String(e.name ?? "")}:${inputs}`;
  };
  const sorted = [...abiArray].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return JSON.stringify(sorted.map(canonicalJson));
}

function hashAbi(abi: unknown): string {
  return createHash("sha256").update(canonicalAbiJson(abi)).digest("hex");
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Main entry
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Parse a Hardhat workspace at `projectRoot` and return one IngestedContract
 * per deployment artifact found under `deployments/<network>/<name>.json`.
 */
export function ingestHardhatWorkspace(projectRoot: string): HardhatIngestReport {
  const found = findHardhatRoot(projectRoot);
  if (!found) {
    throw new Error(`No hardhat.config.{ts,js,cjs,mjs} found at or above ${projectRoot}.`);
  }
  const { root, configPath } = found;
  const deploymentsDir = resolve(root, "deployments");
  const warnings: string[] = [];
  const contracts: IngestedContract[] = [];
  const sourceCommit = readGitHead(root);
  if (!sourceCommit) warnings.push("Could not resolve git HEAD; source commits will be empty.");

  if (!existsSync(deploymentsDir)) {
    warnings.push(`No deployments/ directory at ${deploymentsDir}. Run \`hardhat deploy --network <name>\` first, or use a different Hardhat plugin's artifact location.`);
    return { projectRoot: root, configPath, contracts, sourceCommit, warnings };
  }

  let networkDirs: string[] = [];
  try {
    networkDirs = readdirSync(deploymentsDir).filter((d) => {
      try {
        return statSync(resolve(deploymentsDir, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch (e) {
    warnings.push(`Failed to read deployments/: ${(e as Error).message}`);
    return { projectRoot: root, configPath, contracts, sourceCommit, warnings };
  }

  for (const networkDir of networkDirs) {
    const networkPath = resolve(deploymentsDir, networkDir);
    let files: string[] = [];
    try {
      files = readdirSync(networkPath).filter((f) => f.endsWith(".json") && f !== ".chainId");
    } catch {
      continue;
    }

    const spec = classifyNetwork(networkDir);
    // hardhat-deploy also writes a `.chainId` plain-text file next to artifacts —
    // honor it if present so we don't misclassify custom network names.
    const chainIdFile = resolve(networkPath, ".chainId");
    let observedChainId: number | undefined;
    if (existsSync(chainIdFile)) {
      const raw = readFileSync(chainIdFile, "utf8").trim();
      if (/^\d+$/.test(raw)) observedChainId = parseInt(raw, 10);
    }

    for (const file of files) {
      const filePath = resolve(networkPath, file);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
      } catch (e) {
        warnings.push(`Skipped ${networkDir}/${file}: invalid JSON (${(e as Error).message.slice(0, 80)})`);
        continue;
      }

      const address = typeof parsed.address === "string" ? parsed.address : undefined;
      if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        warnings.push(`Skipped ${networkDir}/${file}: missing or malformed 'address'`);
        continue;
      }
      const contractName = basename(file, ".json");
      const abi = parsed.abi;
      const txHash = typeof parsed.transactionHash === "string" ? parsed.transactionHash : undefined;

      const entry: IngestedContract = {
        address,
        chain: spec.chain,
        name: contractName,
      };
      const effectiveChainId = observedChainId ?? spec.chainId;
      if (effectiveChainId) entry.chainId = effectiveChainId;
      if (abi !== undefined) entry.abiHash = hashAbi(abi);
      if (sourceCommit) entry.sourceCommit = sourceCommit;
      if (txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) entry.txHash = txHash;

      contracts.push(entry);
    }
  }

  return { projectRoot: root, configPath, contracts, sourceCommit, warnings };
}
