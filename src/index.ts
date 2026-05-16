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

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = Object.fromEntries(
  Kinds.map((k) => [k, ajv.compile(schemas[k])]),
) as Record<Kind, ReturnType<typeof ajv.compile>>;

const store = new Store();

const server = new Server(
  { name: "gmem", version: "0.2.0" },
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
      description: "Show how memory state changed between two points in time. Accepts either ISO 8601 timestamps directly, or git commit refs (when called from a client that can resolve them). v0.2 implements the timestamp form; commit resolution lands in v0.5.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO 8601 timestamp (e.g. '2026-05-01T00:00:00Z') or — once v0.5 lands — a git commit ref" },
          to:   { type: "string", description: "ISO 8601 timestamp or git commit ref" },
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
  ],
}));

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function ajvErrorsToReadable(errs: ErrorObject[] | null | undefined): string {
  if (!errs?.length) return "unknown validation error";
  return errs.map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ");
}

function isIsoTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s);
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
      const validator = validators[kind];
      if (!validator(entity)) {
        return jsonResult({ ok: false, error: `schema validation failed: ${ajvErrorsToReadable(validator.errors)}` });
      }
      const { id, version } = store.write(kind, entity);
      return jsonResult({ ok: true, id, version });
    }

    case "gmem.diff": {
      const from = String(a.from ?? "");
      const to = String(a.to ?? "");
      if (isIsoTimestamp(from) && isIsoTimestamp(to)) {
        const { added, changed } = store.diffByTimestamp(from, to);
        return jsonResult({ added, changed, removed: [] });
      }
      return jsonResult({
        added: [], removed: [], changed: [],
        note: `gmem.diff for git commit refs requires per-commit observation, which lands in v0.5. ` +
              `For now pass ISO 8601 timestamps. Requested: ${from} → ${to}`,
      });
    }

    case "gmem.list_decisions": {
      const limit = Number(a.limit ?? 50);
      return jsonResult({ decisions: store.listDecisions(limit) });
    }

    default:
      return jsonResult({ ok: false, error: `unknown tool: ${name}` });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `gmem v0.2.0 — listening on stdio\n` +
    `  project: ${resolveProjectRoot()}\n` +
    `  db:      ${resolveDbPath()}\n` +
    `  tools:   gmem.recall, gmem.write, gmem.diff, gmem.list_decisions\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`gmem fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
