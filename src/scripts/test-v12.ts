/**
 * v1.2 benchmark — Solana agent-activity ingest + heuristic trust score.
 *
 * Fixture: fixtures/helius-agent/sample.json — synthetic
 * getSignaturesForAddress + getTransaction snapshot. Agent has 10 txs across
 * ~9 months, 2 failed, 3 distinct peers, one flagged sanctioned. Asserts:
 *
 *   1. Ingest aggregates fixture into the right Agent shape (txCount=10,
 *      peerCount=3, failureRatio=0.2, firstSeen/lastSeen span ~9 months)
 *   2. Sanctioned-neighbor count fires when caller passes a sanctions list
 *   3. Score is deterministic + bounded: same inputs → same output, always [0,100]
 *   4. Sanctions penalty actually bites: same agent score drops ≥20 when a
 *      sanctioned neighbor is added vs. when it isn't
 *   5. Append-only: re-scoring writes a v2 row, not a duplicate logical entity
 *   6. Schema rejection: malformed pubkey is refused by the AJV validator,
 *      valid records still persist
 *
 * Run: npm run test:v12
 */
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ingestAgentActivity } from "../ingest/helius.js";
import { scoreAgent } from "../score/agent.js";
import { Store } from "../db.js";
import { schemas } from "../schemas.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function header(s: string) { console.log(`\n── ${s} ──`); }

const fixturePath = resolve(process.cwd(), "fixtures", "helius-agent", "sample.json");
const tmp = resolve(tmpdir(), `gmem-v12-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const dbPath = resolve(tmp, "test.db");

const AGENT = "Agent11111111111111111111111111111";
const SANCTIONED = "BadPeer11111111111111111111111111";
const FROZEN_NOW = new Date("2026-05-25T00:00:00Z");

try {
  /* ── 1 ── Fixture aggregates into expected Agent shape ─────────────── */
  header("1. Ingest aggregates fixture into Agent shape");
  const report = await ingestAgentActivity({
    pubkey: AGENT,
    cluster: "mainnet-beta",
    fixturePath,
  });
  console.log(`  source:                  ${report.source}`);
  console.log(`  txCount:                 ${report.agent.txCount}`);
  console.log(`  peerCount:               ${report.agent.peerCount}`);
  console.log(`  failureRatio:            ${report.agent.failureRatio}`);
  console.log(`  sanctionedNeighborCount: ${report.agent.sanctionedNeighborCount}`);
  console.log(`  firstSeen:               ${report.agent.firstSeen}`);
  console.log(`  lastSeen:                ${report.agent.lastSeen}`);
  console.log(`  peers:                   ${report.peers.join(", ")}`);

  assert(report.source === "fixture", "must report fixture source");
  assert(report.agent.txCount === 10, `txCount should be 10, got ${report.agent.txCount}`);
  assert(report.agent.peerCount === 3, `peerCount should be 3, got ${report.agent.peerCount}`);
  assert(Math.abs(report.agent.failureRatio - 0.2) < 1e-9, `failureRatio should be 0.2, got ${report.agent.failureRatio}`);
  assert(report.agent.sanctionedNeighborCount === 0, "sanctionedNeighborCount should be 0 when no list passed");
  assert(report.agent.firstSeen && report.agent.firstSeen.startsWith("2025-"), `firstSeen should be in 2025, got ${report.agent.firstSeen}`);
  assert(report.agent.lastSeen && report.agent.lastSeen.startsWith("2026-"),   `lastSeen should be in 2026, got ${report.agent.lastSeen}`);

  /* ── 2 ── Sanctioned-list pass-through ─────────────────────────────── */
  header("2. Sanctioned-neighbor count fires when caller supplies a list");
  const sanctionedReport = await ingestAgentActivity({
    pubkey: AGENT,
    cluster: "mainnet-beta",
    fixturePath,
    sanctionedList: [SANCTIONED],
  });
  console.log(`  sanctionedNeighborCount: ${sanctionedReport.agent.sanctionedNeighborCount}`);
  assert(sanctionedReport.agent.sanctionedNeighborCount === 1, "expected 1 sanctioned neighbor");

  /* ── 3 ── Score is deterministic + bounded ─────────────────────────── */
  header("3. Score is deterministic + bounded [0, 100]");
  const cleanScore = scoreAgent(report.agent, FROZEN_NOW);
  const cleanScoreRepeat = scoreAgent(report.agent, FROZEN_NOW);
  console.log(`  clean score:  ${cleanScore.score}  (${cleanScore.scoreReasoning})`);
  assert(cleanScore.score >= 0 && cleanScore.score <= 100, `score out of bounds: ${cleanScore.score}`);
  assert(cleanScore.score === cleanScoreRepeat.score, "score must be deterministic for the same inputs + frozen clock");
  assert(cleanScore.scoreVersion === "v1-heuristic", "scoreVersion must be v1-heuristic");
  assert(cleanScore.breakdown.age > 5, `age boost should be substantial for a 9mo-old agent, got ${cleanScore.breakdown.age}`);

  /* ── 4 ── Sanctions penalty actually bites ─────────────────────────── */
  header("4. Sanctions penalty drops score by ≥20");
  const dirtyScore = scoreAgent(sanctionedReport.agent, FROZEN_NOW);
  console.log(`  dirty score:  ${dirtyScore.score}  (${dirtyScore.scoreReasoning})`);
  const drop = cleanScore.score - dirtyScore.score;
  console.log(`  drop:         ${drop.toFixed(1)} points`);
  assert(drop >= 20, `sanctioned neighbor should drop score by ≥20, dropped only ${drop}`);
  assert(dirtyScore.breakdown.sanctionsPenalty < 0, "sanctionsPenalty breakdown should be negative");

  /* ── 5 ── Append-only across re-scoring ────────────────────────────── */
  header("5. Append-only: re-scoring yields v2, not a duplicate logical entity");
  const store = new Store(dbPath);
  store.write("Agent", { ...report.agent, score: cleanScore.score, scoreVersion: cleanScore.scoreVersion, scoreReasoning: cleanScore.scoreReasoning, scoredAt: cleanScore.scoredAt });
  const after1 = store.count();
  console.log(`  after first write:  total=${after1.total}, distinct=${after1.latest}`);
  assert(after1.total === 1 && after1.latest === 1, "first write: 1 raw, 1 distinct");

  // Re-score with sanctions list — same logical agent, new version.
  store.write("Agent", { ...sanctionedReport.agent, ...dirtyScore });
  const after2 = store.count();
  console.log(`  after second write: total=${after2.total}, distinct=${after2.latest}`);
  assert(after2.total === 2, "second write must produce v2 row");
  assert(after2.latest === 1, "logical entity count must stay at 1");

  // History must preserve both score versions in order.
  const history = store.history("Agent", `mainnet-beta:${AGENT}`);
  console.log(`  history depth: ${history.length}`);
  assert(history.length === 2, `history depth should be 2, got ${history.length}`);
  assert(history[0].data.sanctionedNeighborCount === 0, "v1 must have 0 sanctioned neighbors");
  assert(history[1].data.sanctionedNeighborCount === 1, "v2 must have 1 sanctioned neighbor");
  store.close();

  /* ── 6 ── Schema rejection on malformed pubkey ─────────────────────── */
  header("6. Schema rejection — malformed pubkey is refused");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schemas.Agent);

  const goodEntity = { ...report.agent, score: cleanScore.score, scoreVersion: cleanScore.scoreVersion, scoreReasoning: cleanScore.scoreReasoning, scoredAt: cleanScore.scoredAt };
  const goodOk = validate(goodEntity);
  console.log(`  valid Agent passes:    ${goodOk}`);
  assert(goodOk, "valid Agent entity must pass schema");

  const badEntity = { ...goodEntity, pubkey: "0OIl_not_base58_at_all" };
  const badOk = validate(badEntity);
  console.log(`  malformed pubkey:      ${badOk}`);
  assert(!badOk, "malformed pubkey must fail schema");

  const missingCluster = { ...goodEntity } as Record<string, unknown>;
  delete missingCluster.cluster;
  const missOk = validate(missingCluster);
  console.log(`  missing cluster:       ${missOk}`);
  assert(!missOk, "missing required cluster must fail schema");

  console.log("\n✅ v1.2 benchmark passed: ingest aggregate · sanctions wiring · score determinism · sanctions penalty · append-only · schema rejection");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
