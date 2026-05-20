#!/usr/bin/env node
/**
 * gmem — Persistent project memory MCP server for Solana AI agents.
 *
 * v0.2 — SQLite-backed implementation. The four tools (recall, write, diff,
 * list_decisions) are all real:
 *   - storage:    SQLite via better-sqlite3, one db file per project
 *   - ranking:    SQLite FTS5 BM25 + recency boost
 *   - versioning: append-only, every write inserts a new (kind, natural_id, version) row
 *
 * Spec: ../SPEC.md  ·  Roadmap: ../ROADMAP.md
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { Kinds, schemas, type Kind } from "./schemas.js";
import { Store, resolveDbPath, resolveProjectRoot } from "./db.js";
import { ingestAnchorWorkspace } from "./ingest/anchor.js";
import { ingestHardhatWorkspace } from "./ingest/hardhat.js";
import { readSolanaCliContext, isValidPubkey } from "./ingest/solana-cli.js";
import { resolveRefPair } from "./ingest/git.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = Object.fromEntries(
  Kinds.map((k) => [k, ajv.compile(schemas[k])]),
) as Record<Kind, ReturnType<typeof ajv.compile>>;

const store = new Store();

const server = new Server(
  { name: "gmem", version: "1.1.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "gmem.recall",
      description: "Retrieve memory entries relevant to a natural-language query for the active Solana project. Ranked by BM25 over entity fields with a recency boost.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language description of what you want to recall" },
          kinds: { type: "array", items: { type: "string", enum: [...Kinds] }, description: "Optional filter to specific entity kinds" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "gmem.write",
      description: "Persist a typed memory entry (Program / Account / Instruction / Decision / Finding / Integration). Append-only: re-writing the same logical entity creates a new version, never overwrites.",
      inputSchema: {
        type: "object",
        properties: {
          kind:   { type: "string", enum: [...Kinds] },
          entity: { type: "object" },
        },
        required: ["kind", "entity"],
      },
    },
    {
      name: "gmem.diff",
      description: "Show how memory state changed between two points in time. Accepts ISO 8601 timestamps OR git commit refs (HEAD, HEAD~3, branch names, full or short SHAs) — refs are resolved via `git show -s --format=%cI` in the active project root. v0.5 milestone.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO 8601 timestamp or git commit ref (e.g. 'HEAD~5', 'main', 'abc1234')" },
          to:   { type: "string", description: "ISO 8601 timestamp or git commit ref (e.g. 'HEAD')" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "gmem.list_decisions",
      description: "List all Decision entries for the active project, newest first.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 500, default: 50 },
        },
      },
    },
    {
      name: "gmem.ingest_anchor",
      description: "Auto-ingest an Anchor workspace: parses `Anchor.toml`, captures the IDL SHA-256 for each program from `target/idl/<name>.json`, and records the current git HEAD as the source commit. Writes one Program entity per (program, cluster) pair. v0.3 milestone.",
      inputSchema: {
        type: "object",
        properties: {
          projectRoot: { type: "string", description: "Optional path to the Anchor workspace root. Defaults to the active project root (resolved from cwd)." },
        },
      },
    },
    {
      name: "gmem.solana_context",
      description: "Read the active Solana CLI context (`~/.config/solana/cli/config.yml`) and return the configured cluster, RPC URL, and the public address of the active keypair. Used to auto-attribute Decision writes to a developer wallet. v0.4 milestone. Does not return the secret key.",
      inputSchema: {
        type: "object",
        properties: {
          configPath: { type: "string", description: "Optional path to the Solana CLI config.yml. Defaults to ~/.config/solana/cli/config.yml." },
        },
      },
    },
    {
      name: "gmem.ingest_hardhat",
      description: "Auto-ingest a Hardhat (EVM) workspace: walks up to the nearest hardhat.config.{ts,js,cjs,mjs}, reads every deployment artifact under deployments/<network>/<Contract>.json (hardhat-deploy convention), classifies the network into a canonical chain id, computes a stable ABI sha256, records git HEAD as sourceCommit. Writes one Contract entity per (chain, address). v1.1 milestone. Companion to gmem.ingest_anchor for Solana.",
      inputSchema: {
        type: "object",
        properties: {
          projectRoot: { type: "string", description: "Optional path to the Hardhat workspace root. Defaults to the active project root (resolved from cwd)." },
        },
      },
    },
  ],
}));

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function ajvErrorsToReadable(errs: ErrorObject[] | null | undefined): string {
  if (!errs?.length) return "unknown validation error";
  return errs.map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ");
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args as Record<string, unknown> | undefined) ?? {};

  switch (name) {
    case "gmem.recall": {
      const query = String(a.query ?? "");
      const kinds = (a.kinds as Kind[] | undefined) ?? [...Kinds];
      const limit = Number(a.limit ?? 10);
      const results = store.recall(query, kinds, limit);
      return jsonResult({ results });
    }

    case "gmem.write": {
      const kind = a.kind as Kind;
      const entity = (a.entity ?? {}) as Record<string, unknown>;
      if (!Kinds.includes(kind)) {
        return jsonResult({ ok: false, error: `unknown kind: ${kind}` });
      }

      // v0.4: auto-attribute Decisions to the active Solana keypair when the
      // caller hasn't already set a `notes` line claiming attribution.
      if (kind === "Decision" && !entity.author) {
        try {
          const ctx = readSolanaCliContext();
          if (ctx.pubkey && isValidPubkey(ctx.pubkey)) {
            (entity as Record<string, unknown>).author = ctx.pubkey;
            if (ctx.cluster) (entity as Record<string, unknown>).authorCluster = ctx.cluster;
          }
        } catch {
          // Soft fail — Solana CLI may not be installed. Caller can still pass entity.author explicitly.
        }
      }

      const validator = validators[kind];
      if (!validator(entity)) {
        return jsonResult({ ok: false, error: `schema validation failed: ${ajvErrorsToReadable(validator.errors)}` });
      }
      const { id, version } = store.write(kind, entity);
      return jsonResult({ ok: true, id, version });
    }

    case "gmem.diff": {
      const fromRef = String(a.from ?? "");
      const toRef = String(a.to ?? "");
      try {
        const { from, to } = resolveRefPair(fromRef, toRef, { cwd: resolveProjectRoot() });
        const { added, changed } = store.diffByTimestamp(from, to);
        return jsonResult({
          added,
          changed,
          removed: [],
          resolved: { from, to },
          inputRefs: { from: fromRef, to: toRef },
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          added: [], removed: [], changed: [],
          error: (e as Error).message,
          inputRefs: { from: fromRef, to: toRef },
        });
      }
    }

    case "gmem.list_decisions": {
      const limit = Number(a.limit ?? 50);
      return jsonResult({ decisions: store.listDecisions(limit) });
    }

    case "gmem.solana_context": {
      const configPath = typeof a.configPath === "string" ? a.configPath : undefined;
      try {
        const ctx = readSolanaCliContext(configPath);
        return jsonResult({
          ok: true,
          configPath: ctx.configPath,
          cluster: ctx.cluster ?? null,
          rpcUrl: ctx.rpcUrl ?? null,
          commitment: ctx.commitment ?? null,
          keypairPath: ctx.keypairPath ?? null,
          pubkey: ctx.pubkey ?? null,
          warnings: ctx.warnings,
        });
      } catch (e) {
        return jsonResult({ ok: false, error: (e as Error).message });
      }
    }

    case "gmem.ingest_anchor": {
      const projectRoot = String(a.projectRoot ?? resolveProjectRoot());
      try {
        const report = ingestAnchorWorkspace(projectRoot);
        const written: Array<{ id: string; cluster: string; name: string; version: number }> = [];
        for (const p of report.programs) {
          const validator = validators.Program;
          if (!validator(p)) {
            report.warnings.push(`Schema rejected program ${p.cluster}:${p.id} — ${ajvErrorsToReadable(validator.errors)}`);
            continue;
          }
          const { version } = store.write("Program", { ...p });
          written.push({ id: p.id, cluster: p.cluster, name: p.name, version });
        }
        return jsonResult({
          ok: true,
          projectRoot: report.projectRoot,
          anchorTomlPath: report.anchorTomlPath,
          sourceCommit: report.sourceCommit ?? null,
          programsParsed: report.programs.length,
          programsWritten: written,
          warnings: report.warnings,
        });
      } catch (e) {
        return jsonResult({ ok: false, error: (e as Error).message });
      }
    }

    case "gmem.ingest_hardhat": {
      const projectRoot = String(a.projectRoot ?? resolveProjectRoot());
      try {
        const report = ingestHardhatWorkspace(projectRoot);
        const written: Array<{ address: string; chain: string; name: string; version: number }> = [];
        for (const c of report.contracts) {
          const validator = validators.Contract;
          if (!validator(c)) {
            report.warnings.push(`Schema rejected contract ${c.chain}:${c.address} — ${ajvErrorsToReadable(validator.errors)}`);
            continue;
          }
          const { version } = store.write("Contract", { ...c });
          written.push({ address: c.address, chain: c.chain, name: c.name, version });
        }
        return jsonResult({
          ok: true,
          projectRoot: report.projectRoot,
          configPath: report.configPath,
          sourceCommit: report.sourceCommit ?? null,
          contractsParsed: report.contracts.length,
          contractsWritten: written,
          warnings: report.warnings,
        });
      } catch (e) {
        return jsonResult({ ok: false, error: (e as Error).message });
      }
    }

    default:
      return jsonResult({ ok: false, error: `unknown tool: ${name}` });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `gmem v1.1.0 — listening on stdio\n` +
    `  project: ${resolveProjectRoot()}\n` +
    `  db:      ${resolveDbPath()}\n` +
    `  tools:   gmem.recall, gmem.write, gmem.diff, gmem.list_decisions, gmem.ingest_anchor, gmem.solana_context, gmem.ingest_hardhat\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`gmem fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
