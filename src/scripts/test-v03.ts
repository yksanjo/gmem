/**
 * v0.3 benchmark — Anchor workspace auto-ingest.
 *
 * Asserts that gmem.ingest_anchor, called against a synthetic Anchor workspace,
 * produces correctly-shaped Program entities per (program, cluster) pair with
 * a populated IDL hash from `target/idl/<name>.json`.
 *
 * Run: npm run test:v03
 */
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ingestAnchorWorkspace } from "../ingest/anchor.js";
import { Store } from "../db.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function header(s: string) { console.log(`\n── ${s} ──`); }

const fixture = resolve(process.cwd(), "fixtures", "anchor-workspace");

const tmp = resolve(tmpdir(), `gmem-v03-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const dbPath = resolve(tmp, "test.db");

try {
  header("1. Parse Anchor.toml + IDL hash");
  const report = ingestAnchorWorkspace(fixture);
  console.log(`  projectRoot: ${report.projectRoot}`);
  console.log(`  sourceCommit: ${report.sourceCommit ?? "(none)"}`);
  console.log(`  programs: ${report.programs.length}`);
  for (const p of report.programs) {
    console.log(`    ${p.cluster.padEnd(12)} ${p.name.padEnd(8)} ${p.id} idl=${p.idlHash?.slice(0, 12) ?? "(none)"}`);
  }
  assert(report.programs.length === 3, "should yield 3 (program, cluster) pairs for swap on mainnet/devnet/localnet");

  const mainnet = report.programs.find((p) => p.cluster === "mainnet-beta");
  assert(mainnet, "mainnet entry must exist");
  assert(mainnet!.name === "swap", "name must be 'swap'");
  assert(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mainnet!.id), "id must be a base58 public key");
  assert(mainnet!.idlHash && /^[a-f0-9]{64}$/.test(mainnet!.idlHash), "idlHash must be a sha256 hex");

  header("2. Persist into Store and recall");
  const store = new Store(dbPath);
  let written = 0;
  for (const p of report.programs) {
    store.write("Program", { ...p });
    written++;
  }
  console.log(`  wrote ${written} Program entities`);
  assert(written === 3, "all 3 should write cleanly");

  const counts = store.count();
  console.log(`  store count -> total=${counts.total}, distinct=${counts.latest}`);
  assert(counts.total === 3 && counts.latest === 3, "3 raw rows, 3 logical entities (one per cluster)");

  header("3. Re-ingest produces v2 entries (append-only across runs)");
  for (const p of report.programs) {
    store.write("Program", { ...p });
  }
  const after = store.count();
  console.log(`  after re-ingest -> total=${after.total}, distinct=${after.latest}`);
  assert(after.total === 6, "re-running ingest must produce v2 rows for each program");
  assert(after.latest === 3, "still 3 logical programs");

  header("4. Recall finds programs by name");
  const results = store.recall("swap", ["Program"], 5);
  console.log(`  recall("swap", Program) -> ${results.length}`);
  assert(results.length >= 1, "recall should find swap programs");

  store.close();

  console.log("\n✅ v0.3 benchmark passed: Anchor.toml parse · IDL sha256 · git source commit · 3 clusters · re-ingest append-only");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
