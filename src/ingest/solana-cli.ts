/**
 * Solana CLI context capture — Milestone 4 / v0.4.
 *
 * Reads `~/.config/solana/cli/config.yml`, classifies the configured RPC URL
 * into a cluster, derives the keypair's public address from the file referenced
 * by `keypair_path`, and returns a structured context object that callers can
 * use to:
 *   1. Auto-attribute `Decision` writes to the active developer wallet
 *   2. Set a sensible default cluster for any Program writes that omit it
 *
 * No network calls. No transaction signing. The keypair is read locally only
 * to derive the pubkey — the secret key is never returned or logged.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { Keypair, PublicKey } from "@solana/web3.js";

export interface SolanaCliContext {
  configPath: string;
  rpcUrl?: string;
  websocketUrl?: string;
  commitment?: string;
  cluster?: "mainnet-beta" | "devnet" | "testnet" | "localnet" | "custom";
  keypairPath?: string;
  pubkey?: string;
  warnings: string[];
}

/** Default location per `solana config get` documentation. */
export function defaultConfigPath(): string {
  return resolve(homedir(), ".config", "solana", "cli", "config.yml");
}

function classifyRpc(url: string | undefined): SolanaCliContext["cluster"] {
  if (!url) return undefined;
  const lower = url.toLowerCase();
  if (lower.includes("mainnet")) return "mainnet-beta";
  if (lower.includes("devnet")) return "devnet";
  if (lower.includes("testnet")) return "testnet";
  if (lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes(":8899")) {
    return "localnet";
  }
  return "custom";
}

function expandPath(p: string): string {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

/**
 * Read the Solana CLI config and derive a context. Throws if the config file
 * does not exist; soft-fails (via the `warnings` array) for parse errors and
 * for an unreadable keypair file.
 */
export function readSolanaCliContext(configPath?: string): SolanaCliContext {
  const path = configPath ?? defaultConfigPath();
  if (!existsSync(path)) {
    throw new Error(`Solana CLI config not found at ${path}. Run \`solana config get\` to verify, or pass an explicit configPath.`);
  }

  const warnings: string[] = [];
  let raw: Record<string, unknown> = {};
  try {
    raw = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    warnings.push(`Failed to parse YAML at ${path}: ${(e as Error).message}`);
    return { configPath: path, warnings };
  }

  const rpcUrl = typeof raw.json_rpc_url === "string" ? raw.json_rpc_url : undefined;
  const websocketUrl = typeof raw.websocket_url === "string" ? raw.websocket_url : undefined;
  const commitment = typeof raw.commitment === "string" ? raw.commitment : undefined;
  const keypairPath = typeof raw.keypair_path === "string" ? expandPath(raw.keypair_path) : undefined;

  const ctx: SolanaCliContext = {
    configPath: path,
    rpcUrl,
    websocketUrl,
    commitment,
    cluster: classifyRpc(rpcUrl),
    keypairPath,
    warnings,
  };

  if (keypairPath) {
    if (!existsSync(keypairPath)) {
      warnings.push(`keypair_path points to ${keypairPath} which does not exist.`);
    } else {
      try {
        const secret = JSON.parse(readFileSync(keypairPath, "utf8")) as number[];
        const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
        ctx.pubkey = kp.publicKey.toBase58();
      } catch (e) {
        warnings.push(`Could not read keypair at ${keypairPath}: ${(e as Error).message}`);
      }
    }
  } else {
    warnings.push("Solana CLI config has no keypair_path; Decision entries will not be attributed.");
  }

  return ctx;
}

/**
 * Validate a base58 string as a well-formed Solana public key. Used by the
 * MCP tool wrapper to refuse to write malformed pubkeys into Decision entries.
 */
export function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}
