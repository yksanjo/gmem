/**
 * Anchor workspace auto-ingest — Milestone 3 / v0.3.
 *
 * Walks an Anchor project, extracts every (program, cluster) pair from `Anchor.toml`,
 * pulls the IDL hash from `target/idl/<name>.json` if present, and records the
 * current git HEAD as the source commit. Each entry is shaped to fit the v0.1
 * `Program` schema and is intended to be written via `Store.write("Program", ...)`.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as TOML from "@iarna/toml";

export interface IngestedProgram {
  id: string;
  cluster: "mainnet-beta" | "devnet" | "testnet" | "localnet" | string;
  name: string;
  idlHash?: string;
  sourceCommit?: string;
  notes?: string;
}

export interface IngestReport {
  projectRoot: string;
  anchorTomlPath: string;
  programs: IngestedProgram[];
  sourceCommit?: string;
  warnings: string[];
}

/** Find the nearest Anchor.toml walking up from `start`. */
export function findAnchorRoot(start: string): string | null {
  let dir = resolve(start);
  while (true) {
    if (existsSync(resolve(dir, "Anchor.toml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeCluster(c: string): IngestedProgram["cluster"] {
  const lower = c.toLowerCase();
  if (lower === "mainnet" || lower === "mainnet-beta") return "mainnet-beta";
  if (lower === "devnet") return "devnet";
  if (lower === "testnet") return "testnet";
  if (lower === "localnet" || lower === "localhost") return "localnet";
  return lower;
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

function readIdlHash(projectRoot: string, programName: string): string | undefined {
  const idlPath = resolve(projectRoot, "target", "idl", `${programName}.json`);
  if (!existsSync(idlPath)) return undefined;
  try {
    const buf = readFileSync(idlPath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * Parse an Anchor workspace at `projectRoot` and return the structured
 * (program, cluster) pairs ready to be written into gmem.
 */
export function ingestAnchorWorkspace(projectRoot: string): IngestReport {
  const root = findAnchorRoot(projectRoot);
  if (!root) {
    throw new Error(`No Anchor.toml found at or above ${projectRoot}`);
  }
  const anchorTomlPath = resolve(root, "Anchor.toml");
  const raw = readFileSync(anchorTomlPath, "utf8");

  let parsed: Record<string, unknown>;
  try {
    parsed = TOML.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to parse Anchor.toml: ${(e as Error).message}`);
  }

  const warnings: string[] = [];
  const programsByCluster = (parsed.programs as Record<string, Record<string, unknown>> | undefined) ?? {};
  if (Object.keys(programsByCluster).length === 0) {
    warnings.push("Anchor.toml has no [programs.*] sections; nothing to ingest.");
  }

  const sourceCommit = readGitHead(root);
  if (!sourceCommit) warnings.push("Could not resolve git HEAD; source commits will be empty.");

  const programs: IngestedProgram[] = [];
  for (const [cluster, table] of Object.entries(programsByCluster)) {
    if (!table || typeof table !== "object") continue;
    for (const [name, programIdRaw] of Object.entries(table)) {
      if (typeof programIdRaw !== "string") {
        warnings.push(`Skipped non-string program id at programs.${cluster}.${name}`);
        continue;
      }
      const programId = programIdRaw.trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(programId)) {
        warnings.push(`Skipped invalid program id at programs.${cluster}.${name}: "${programId}"`);
        continue;
      }
      const entry: IngestedProgram = {
        id: programId,
        cluster: normalizeCluster(cluster),
        name,
      };
      const idlHash = readIdlHash(root, name);
      if (idlHash) entry.idlHash = idlHash;
      if (sourceCommit) entry.sourceCommit = sourceCommit;
      programs.push(entry);
    }
  }

  return { projectRoot: root, anchorTomlPath, programs, sourceCommit, warnings };
}
