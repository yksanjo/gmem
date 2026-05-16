/**
 * v0.2 benchmark test — proves the three v0.2 milestone requirements:
 *   1. SQLite backend (persistence survives process restart)
 *   2. BM25 ranking (relevant entities outrank irrelevant ones for a query)
 *   3. Append-only versioning (re-writing creates v2, v3...; recall returns latest)
 *
 * Unlike test-wire.ts (which speaks MCP over stdio), this is a direct in-process
 * test of the Store class. Fast feedback for benchmark validation.
 *
 * Run: npm run test:v02
 */
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../db.js";

const TMP = resolve(tmpdir(), `gmem-v02-test-${Date.now()}`);
mkdirSync(TMP, { recursive: true });
const DB_PATH = resolve(TMP, "test.db");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function header(s: string) { console.log(`\n── ${s} ──`); }

try {
  /* ── 1. SQLite persistence ────────────────────────────────────────── */
  header("1. SQLite persistence across process restart");

  let store = new Store(DB_PATH);

  store.write("Decision", {
    title: "Use Anchor over native Rust",
    decision: "Use Anchor for all on-chain programs.",
    rationale: "Anchor's IDL + macros help agent tooling reason about programs.",
    alternatives: ["native Rust + manual IDL"],
    date: "2026-05-16T00:00:00Z",
  });
  store.write("Program", {
    id: "11111111111111111111111111111111",
    cluster: "mainnet-beta",
    name: "system",
  });
  store.write("Decision", {
    title: "Pinocchio for hot-path program",
    decision: "Migrate the high-frequency settlement program from Anchor to Pinocchio.",
    rationale: "88–95% compute unit reduction; the hot path runs 4M times per day.",
    alternatives: ["stay on Anchor", "native Rust"],
    date: "2026-05-15T00:00:00Z",
  });

  const countA = store.count();
  console.log(`  wrote 3 entities -> total=${countA.total}, latest-distinct=${countA.latest}`);
  assert(countA.total === 3 && countA.latest === 3, "after 3 writes we expect 3 rows, 3 logical entities");

  store.close();

  // Reopen — the test is whether data is there
  store = new Store(DB_PATH);
  const countB = store.count();
  console.log(`  after reopen -> total=${countB.total}, latest-distinct=${countB.latest}`);
  assert(countB.total === 3 && countB.latest === 3, "data MUST survive process restart");

  /* ── 2. BM25 ranking ──────────────────────────────────────────────── */
  header("2. BM25 ranking — relevant entity must outrank irrelevant");

  const pinocchioResults = store.recall("pinocchio compute unit", ["Decision"], 5);
  console.log(`  recall("pinocchio compute unit") -> ${pinocchioResults.length} results`);
  for (const r of pinocchioResults) {
    console.log(`    score=${r.score.toFixed(3)} :: ${(r.entity as { title: string }).title}`);
  }
  assert(pinocchioResults.length >= 1, "should match the Pinocchio decision");
  assert(
    /pinocchio/i.test((pinocchioResults[0]!.entity as { title: string }).title),
    "the Pinocchio decision MUST rank first for a Pinocchio-flavored query",
  );

  const anchorResults = store.recall("anchor idl", ["Decision"], 5);
  console.log(`  recall("anchor idl") -> ${anchorResults.length} results`);
  for (const r of anchorResults) {
    console.log(`    score=${r.score.toFixed(3)} :: ${(r.entity as { title: string }).title}`);
  }
  assert(anchorResults.length >= 1, "should match the Anchor decision");
  assert(
    /anchor/i.test((anchorResults[0]!.entity as { title: string }).title),
    "the Anchor decision MUST rank first for an Anchor-flavored query",
  );

  /* ── 3. Append-only versioning ────────────────────────────────────── */
  header("3. Append-only versioning — re-writes create new versions, never overwrite");

  const decision = store.listDecisions().find((d) => /Anchor over native/i.test(String(d.title)));
  assert(decision, "must find the Anchor decision in list_decisions");
  const decisionId = decision!.id as string;

  // Re-write the same decision with a new rationale
  const second = store.write("Decision", {
    id: decisionId,
    title: "Use Anchor over native Rust",
    decision: "Use Anchor for all on-chain programs.",
    rationale: "Updated rationale: also for codegen across our Anchor + Pinocchio split.",
    alternatives: ["native Rust + manual IDL"],
    date: "2026-05-16T01:00:00Z",
  });
  console.log(`  second write returned version=${second.version}`);
  assert(second.version === 2, "second write of same decision must be version 2");

  // Third write
  const third = store.write("Decision", {
    id: decisionId,
    title: "Use Anchor over native Rust",
    decision: "Use Anchor for all on-chain programs.",
    rationale: "v3 rationale: after consulting auditors.",
    alternatives: ["native Rust + manual IDL"],
    date: "2026-05-16T02:00:00Z",
  });
  console.log(`  third write returned version=${third.version}`);
  assert(third.version === 3, "third write must be version 3");

  const history = store.history("Decision", decisionId);
  console.log(`  history: ${history.length} versions`);
  for (const h of history) {
    console.log(`    v${h.version} @ ${h.writtenAt} :: ${(h.data as { rationale: string }).rationale.slice(0, 60)}`);
  }
  assert(history.length === 3, "history must contain v1, v2, v3");
  assert(history[0]!.version === 1 && history[2]!.version === 3, "history is in ascending order");

  // list_decisions returns only the LATEST version
  const latestDecisions = store.listDecisions();
  const latestAnchor = latestDecisions.find((d) => d.id === decisionId);
  assert(
    /after consulting auditors/i.test(String(latestAnchor?.rationale)),
    "list_decisions must return the v3 rationale, not v1",
  );
  console.log(`  ✓ list_decisions returns v3, not v1 — append-only honored`);

  // count: total rows grew, but distinct logical entities did not
  const countC = store.count();
  console.log(`  after re-writes -> total=${countC.total}, latest-distinct=${countC.latest}`);
  assert(countC.total === 5, "5 raw rows: 3 original writes + 2 re-writes");
  assert(countC.latest === 3, "still 3 logical entities");

  /* ── 4. diff by timestamp (bonus) ─────────────────────────────────── */
  header("4. diff by timestamp");

  // v1 of the Anchor decision was at the very start; v3 is most recent.
  // Use a midpoint to get a diff slice that captures the re-writes only.
  const midpoint = history[0]!.writtenAt;
  const now = new Date().toISOString();
  const diff = store.diffByTimestamp(midpoint, now);
  console.log(`  diff(${midpoint}, now) -> added=${diff.added.length}, changed=${diff.changed.length}`);
  assert(diff.changed.length >= 1, "the Anchor decision must show up as 'changed' (v1 → v3)");
  const anchorChange = diff.changed.find(
    (c) => (c.after as { id: string }).id === decisionId,
  );
  assert(anchorChange, "the changed list must include the Anchor decision");

  store.close();

  console.log("\n✅ v0.2 benchmark: SQLite persistence · BM25 ranking · append-only versioning · diff");
  console.log(`   db file used: ${DB_PATH}`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
