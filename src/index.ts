#!/usr/bin/env node
/**
 * gmem — Persistent project memory MCP server for Solana AI agents.
 *
 * v0.1 — Stub implementation. The four tools are wired and validate inputs
 * against the published JSON schemas, but storage is in-process only and
 * BM25 ranking / git diff / Anchor ingest are stubbed for v0.2+.
 *
 * Spec: ../SPEC.md
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { randomUUID } from "node:crypto";
import { Kinds, schemas, type Kind } from "./schemas.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// Compile validators once
const validators = Object.fromEntries(
  Kinds.map((k) => [k, ajv.compile(schemas[k])]),
) as Record<Kind, ReturnType<typeof ajv.compile>>;

// In-memory store — replaced by SQLite in v0.2
interface StoredEntity {
  kind: Kind;
  id: string;
  version: number;
  data: Record<string, unknown>;
  writtenAt: string;
}
const store = new Map<string, StoredEntity[]>(); // key = `${kind}:${id}`, value = history (latest last)

function naturalKey(kind: Kind, entity: Record<string, unknown>): string {
  // Choose a stable identifier per kind
  switch (kind) {
    case "Program":     return `${entity.cluster}:${entity.id}`;
    case "Account":     return String(entity.address);
    case "Instruction": return `${entity.program}:${entity.name}`;
    case "Integration": return String(entity.programId);
    case "Decision":
    case "Finding":
      return String(entity.id ?? randomUUID());
  }
}

const server = new Server(
  { name: "gmem", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "gmem.recall",
      description: "Retrieve memory entries relevant to a natural-language query for the active Solana project.",
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
      description: "Persist a typed memory entry (Program / Account / Instruction / Decision / Finding / Integration).",
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
      description: "Show how the project's memory state changed between two git commits.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "git commit ref (sha, branch, tag, HEAD~N)" },
          to:   { type: "string", description: "git commit ref" },
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

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  switch (name) {
    case "gmem.recall": {
      const query = String((args as Record<string, unknown>)?.query ?? "");
      const kinds = ((args as Record<string, unknown>)?.kinds as Kind[] | undefined) ?? [...Kinds];
      const limit = Number((args as Record<string, unknown>)?.limit ?? 10);
      const lower = query.toLowerCase();

      const candidates: Array<{ kind: Kind; entity: Record<string, unknown>; score: number; matchedFields: string[] }> = [];
      for (const [key, history] of store.entries()) {
        const latest = history[history.length - 1]!;
        if (!kinds.includes(latest.kind)) continue;
        // v0.1 ranking: cheap field-match scoring. BM25 + recency boost in v0.2.
        const serialized = JSON.stringify(latest.data).toLowerCase();
        if (!serialized.includes(lower)) continue;
        const matched = Object.entries(latest.data)
          .filter(([, v]) => String(v).toLowerCase().includes(lower))
          .map(([k]) => k);
        candidates.push({ kind: latest.kind, entity: latest.data, score: matched.length / Math.max(1, Object.keys(latest.data).length), matchedFields: matched });
      }
      candidates.sort((a, b) => b.score - a.score);
      return jsonResult({ results: candidates.slice(0, limit) });
    }

    case "gmem.write": {
      const a = (args as Record<string, unknown>) ?? {};
      const kind = a.kind as Kind;
      const entity = (a.entity ?? {}) as Record<string, unknown>;
      if (!Kinds.includes(kind)) {
        return jsonResult({ ok: false, error: `unknown kind: ${kind}` });
      }
      const validator = validators[kind];
      const ok = validator(entity);
      if (!ok) {
        return jsonResult({ ok: false, error: `schema validation failed: ${ajvErrorsToReadable(validator.errors)}` });
      }
      // Generate id if not set for kinds that auto-gen
      if ((kind === "Decision" || kind === "Finding") && !entity.id) entity.id = randomUUID();
      const key = `${kind}:${naturalKey(kind, entity)}`;
      const history = store.get(key) ?? [];
      const version = history.length + 1;
      history.push({ kind, id: naturalKey(kind, entity), version, data: entity, writtenAt: new Date().toISOString() });
      store.set(key, history);
      return jsonResult({ ok: true, id: naturalKey(kind, entity), version });
    }

    case "gmem.diff": {
      const a = (args as Record<string, unknown>) ?? {};
      // v0.1: git observation not implemented; return a structured stub indicating that.
      return jsonResult({
        added: [],
        removed: [],
        changed: [],
        note: `gmem.diff requires git observation captured at each commit; landing in v0.5. Requested: ${a.from} → ${a.to}`,
      });
    }

    case "gmem.list_decisions": {
      const limit = Number((args as Record<string, unknown>)?.limit ?? 50);
      const all: Record<string, unknown>[] = [];
      for (const history of store.values()) {
        const latest = history[history.length - 1]!;
        if (latest.kind === "Decision") all.push(latest.data);
      }
      all.sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? "")));
      return jsonResult({ decisions: all.slice(0, limit) });
    }

    default:
      return jsonResult({ ok: false, error: `unknown tool: ${name}` });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so it doesn't pollute the MCP stdio stream
  process.stderr.write("gmem v0.1.0 — listening on stdio (4 tools registered)\n");
}

main().catch((e) => {
  process.stderr.write(`gmem fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
