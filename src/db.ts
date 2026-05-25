/**
 * SQLite-backed persistence for gmem v0.2.
 *
 * - Append-only: every `gmem.write` inserts a new version row; nothing is ever destructively
 *   overwritten. Reads return the latest version per (kind, natural_id) by default.
 * - BM25 ranking via SQLite FTS5 virtual table. Recall results are ranked by FTS5's built-in
 *   BM25 score plus a small recency boost (newer wins on ties).
 * - Project isolation: each project gets its own db file under ~/.gmem/<projectHash>/memory.db
 *   so memory written in project A is invisible to project B.
 */
import Database, { type Database as DB } from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { Kinds, type Kind } from "./schemas.js";

export interface StoredEntity {
  kind: Kind;
  naturalId: string;
  version: number;
  data: Record<string, unknown>;
  writtenAt: string;
}

export interface RecallResult {
  kind: Kind;
  entity: Record<string, unknown>;
  score: number;
  matchedFields: string[];
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Project root resolution
 * ───────────────────────────────────────────────────────────────────────── */

function isWorkspaceCargoToml(path: string): boolean {
  try {
    const content = readFileSync(path, "utf8");
    return /^\s*\[workspace\]/m.test(content);
  } catch {
    return false;
  }
}

/** Walk up from `start` looking for the canonical project marker. */
export function resolveProjectRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  while (true) {
    if (existsSync(resolve(dir, "Anchor.toml"))) return dir;
    if (existsSync(resolve(dir, "Cargo.toml")) && isWorkspaceCargoToml(resolve(dir, "Cargo.toml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start); // hit FS root — fall back to start
    dir = parent;
  }
}

function projectHash(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 16);
}

/** Resolve where the SQLite db lives for the active project. Env override: GMEM_DB. */
export function resolveDbPath(): string {
  const override = process.env.GMEM_DB?.trim();
  if (override) {
    const p = override.startsWith("~/") ? resolve(homedir(), override.slice(2)) : override;
    return isAbsolute(p) ? p : resolve(process.cwd(), p);
  }
  const root = resolveProjectRoot();
  const dir = resolve(homedir(), ".gmem", projectHash(root));
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "memory.db");
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Schema
 * ───────────────────────────────────────────────────────────────────────── */

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS gmem_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  natural_id  TEXT NOT NULL,
  version     INTEGER NOT NULL,
  data        TEXT NOT NULL,           -- serialized JSON
  written_at  TEXT NOT NULL,           -- ISO 8601
  UNIQUE (kind, natural_id, version)
);

CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
CREATE INDEX IF NOT EXISTS idx_entities_kid  ON entities(kind, natural_id);
CREATE INDEX IF NOT EXISTS idx_entities_when ON entities(written_at);

-- FTS5 contentless table; we maintain it manually on insert.
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  searchable_text,
  content=''
);
`;

/** Flatten all string values inside a JSON object/array into one big lower-cased blob. */
function searchableText(data: unknown): string {
  const parts: string[] = [];
  const visit = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === "string") parts.push(v);
    else if (typeof v === "number" || typeof v === "boolean") parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(data);
  return parts.join(" ");
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Store
 * ───────────────────────────────────────────────────────────────────────── */

export class Store {
  private db: DB;

  constructor(path?: string) {
    const p = path ?? resolveDbPath();
    this.db = new Database(p);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
    this.db.prepare("INSERT OR REPLACE INTO gmem_meta(key, value) VALUES('schema_version', ?)").run(String(SCHEMA_VERSION));
  }

  /** Path the active store is bound to — handy for logging. */
  get path(): string {
    return (this.db.name as string) ?? "(unknown)";
  }

  close(): void {
    this.db.close();
  }

  /* ── Natural key per kind ──────────────────────────────────────────── */

  private naturalKey(kind: Kind, entity: Record<string, unknown>): string {
    switch (kind) {
      case "Program":     return `${entity.cluster}:${entity.id}`;
      case "Account":     return String(entity.address);
      case "Instruction": return `${entity.program}:${entity.name}`;
      case "Integration": return String(entity.programId);
      case "Contract":    return `${entity.chain}:${String(entity.address).toLowerCase()}`;
      case "Agent":       return `${entity.cluster}:${entity.pubkey}`;
      case "Decision":
      case "Finding":
        if (!entity.id) entity.id = randomUUID();
        return String(entity.id);
    }
  }

  /* ── Write ─────────────────────────────────────────────────────────── */

  /** Append-only write. Returns the assigned natural_id and new version number. */
  write(kind: Kind, entity: Record<string, unknown>): { id: string; version: number } {
    const naturalId = this.naturalKey(kind, entity);
    const writtenAt = new Date().toISOString();

    const insert = this.db.transaction((): { id: string; version: number } => {
      const row = this.db
        .prepare("SELECT COALESCE(MAX(version), 0) as v FROM entities WHERE kind = ? AND natural_id = ?")
        .get(kind, naturalId) as { v: number };
      const version = row.v + 1;
      const ins = this.db
        .prepare("INSERT INTO entities (kind, natural_id, version, data, written_at) VALUES (?, ?, ?, ?, ?)")
        .run(kind, naturalId, version, JSON.stringify(entity), writtenAt);
      this.db
        .prepare("INSERT INTO entities_fts(rowid, searchable_text) VALUES (?, ?)")
        .run(ins.lastInsertRowid, `${kind} ${naturalId} ${searchableText(entity)}`);
      return { id: naturalId, version };
    });

    return insert();
  }

  /* ── Recall (BM25 + recency) ───────────────────────────────────────── */

  recall(query: string, kinds: readonly Kind[] = Kinds, limit = 10): RecallResult[] {
    if (!query.trim()) return [];
    const ftsQuery = sanitizeFts(query);
    const kindList = kinds.length ? kinds : Kinds;
    const placeholders = kindList.map(() => "?").join(",");

    /*
     * Latest-version-only rows per (kind, natural_id), joined to FTS5 ranked by BM25.
     * Final score = bm25_score (FTS5 returns a negative-relevance value; smaller = better)
     *               minus a recency bonus (days-old * 0.05) so newer wins on near-ties.
     */
    const sql = `
      WITH latest AS (
        SELECT e.rowid, e.kind, e.natural_id, e.version, e.data, e.written_at
        FROM entities e
        WHERE e.version = (
          SELECT MAX(e2.version) FROM entities e2
          WHERE e2.kind = e.kind AND e2.natural_id = e.natural_id
        )
          AND e.kind IN (${placeholders})
      )
      SELECT
        l.kind, l.natural_id, l.data, l.written_at,
        bm25(entities_fts) AS bm25_score,
        (julianday('now') - julianday(l.written_at)) AS days_old
      FROM entities_fts
      JOIN latest l ON l.rowid = entities_fts.rowid
      WHERE entities_fts MATCH ?
      ORDER BY (bm25(entities_fts) + (julianday('now') - julianday(l.written_at)) * 0.05) ASC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(...kindList, ftsQuery, limit) as Array<{
      kind: Kind;
      natural_id: string;
      data: string;
      written_at: string;
      bm25_score: number;
      days_old: number;
    }>;

    const lowerQuery = query.toLowerCase();
    return rows.map((r) => {
      const entity = JSON.parse(r.data) as Record<string, unknown>;
      const matchedFields = Object.entries(entity)
        .filter(([, v]) => searchableText(v).toLowerCase().includes(lowerQuery))
        .map(([k]) => k);
      // Normalize FTS5's negative-relevance score into a positive 0..1-ish display score.
      const score = clamp01(1 / (1 + Math.exp(r.bm25_score / 2)));
      return { kind: r.kind, entity, score, matchedFields };
    });
  }

  /* ── list_decisions ────────────────────────────────────────────────── */

  listDecisions(limit = 50): Record<string, unknown>[] {
    const sql = `
      SELECT e.data
      FROM entities e
      WHERE e.kind = 'Decision'
        AND e.version = (
          SELECT MAX(e2.version) FROM entities e2
          WHERE e2.kind = 'Decision' AND e2.natural_id = e.natural_id
        )
      ORDER BY json_extract(e.data, '$.date') DESC NULLS LAST, e.written_at DESC
      LIMIT ?
    `;
    return (this.db.prepare(sql).all(limit) as { data: string }[]).map((r) => JSON.parse(r.data));
  }

  /* ── diff ──────────────────────────────────────────────────────────── */

  /**
   * Show entities written between two ISO timestamps. v0.2 doesn't have git
   * commit observation yet (lands in v0.5), so the tool accepts either ISO
   * dates directly OR refs the caller has already resolved to timestamps.
   * That keeps the wire shape forward-compatible.
   */
  diffByTimestamp(fromIso: string, toIso: string): {
    added: Record<string, unknown>[];
    changed: { before: Record<string, unknown>; after: Record<string, unknown> }[];
  } {
    const beforeRows = this.db
      .prepare(
        `SELECT kind, natural_id, version, data, written_at
         FROM entities WHERE written_at <= ?`,
      )
      .all(fromIso) as Array<{ kind: string; natural_id: string; version: number; data: string; written_at: string }>;
    const afterRows = this.db
      .prepare(
        `SELECT kind, natural_id, version, data, written_at
         FROM entities WHERE written_at <= ?`,
      )
      .all(toIso) as Array<{ kind: string; natural_id: string; version: number; data: string; written_at: string }>;

    const latestAt = (rows: typeof beforeRows): Map<string, { version: number; data: string }> => {
      const m = new Map<string, { version: number; data: string }>();
      for (const r of rows) {
        const key = `${r.kind}:${r.natural_id}`;
        const prev = m.get(key);
        if (!prev || r.version > prev.version) m.set(key, { version: r.version, data: r.data });
      }
      return m;
    };

    const before = latestAt(beforeRows);
    const after = latestAt(afterRows);

    const added: Record<string, unknown>[] = [];
    const changed: { before: Record<string, unknown>; after: Record<string, unknown> }[] = [];

    for (const [key, a] of after) {
      const b = before.get(key);
      if (!b) added.push(JSON.parse(a.data));
      else if (b.version !== a.version) {
        changed.push({ before: JSON.parse(b.data), after: JSON.parse(a.data) });
      }
    }

    return { added, changed };
  }

  /* ── Diagnostics (handy for tests / debugging) ─────────────────────── */

  count(): { total: number; latest: number } {
    const total = (this.db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number }).n;
    const latest = (this.db
      .prepare(
        `SELECT COUNT(DISTINCT kind || ':' || natural_id) AS n FROM entities`,
      )
      .get() as { n: number }).n;
    return { total, latest };
  }

  /** Return full version history for a single entity. */
  history(kind: Kind, naturalId: string): StoredEntity[] {
    const rows = this.db
      .prepare(
        `SELECT kind, natural_id, version, data, written_at
         FROM entities WHERE kind = ? AND natural_id = ? ORDER BY version ASC`,
      )
      .all(kind, naturalId) as Array<{ kind: Kind; natural_id: string; version: number; data: string; written_at: string }>;
    return rows.map((r) => ({
      kind: r.kind,
      naturalId: r.natural_id,
      version: r.version,
      data: JSON.parse(r.data),
      writtenAt: r.written_at,
    }));
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ───────────────────────────────────────────────────────────────────────── */

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Sanitize a user-typed query into something FTS5 will accept.
 * FTS5 treats `:` `.` `-` etc. as operators; quoting the whole thing keeps
 * the query literal. Splits multi-word into AND-prefix matching.
 */
function sanitizeFts(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9_]/g, ""))
    .filter((t) => t.length > 0);
  if (!tokens.length) return '""';
  return tokens.map((t) => `"${t}"*`).join(" ");
}
