/**
 * v1.1 benchmark — Hardhat (EVM) workspace auto-ingest.
 *
 * Fixture: fixtures/hardhat-workspace/ — synthetic project with two networks
 * (base, optimism), three deployment artifacts, a hardhat-deploy-style
 * .chainId file. Asserts:
 *
 *   1. Discovery: walks up from a nested cwd to find hardhat.config.js
 *   2. Multi-network: yields the right number of Contract entries per chain
 *   3. Chain classification: base → base-mainnet (chainId 8453),
 *      optimism → optimism-mainnet (chainId 10)
 *   4. ABI hash: identical ABI in different order produces the SAME sha256
 *   5. Append-only: re-ingesting yields v2 rows, not duplicate logical entities
 *   6. Schema rejection: a malformed address artifact yields a warning + is
 *      excluded, while valid siblings still write
 *
 * Run: npm run test:v11
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ingestHardhatWorkspace } from "../ingest/hardhat.js";
import { Store } from "../db.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function header(s: string) { console.log(`\n── ${s} ──`); }

const fixture = resolve(process.cwd(), "fixtures", "hardhat-workspace");
const tmp = resolve(tmpdir(), `gmem-v11-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const dbPath = resolve(tmp, "test.db");

try {
  header("1. Walk up from a nested directory");
  const nested = resolve(fixture, "deployments", "base"); // start two levels deep
  const report = ingestHardhatWorkspace(nested);
  console.log(`  projectRoot:  ${report.projectRoot}`);
  console.log(`  configPath:   ${report.configPath}`);
  console.log(`  sourceCommit: ${report.sourceCommit ?? "(none)"}`);
  console.log(`  contracts:    ${report.contracts.length}`);
  assert(report.projectRoot === fixture, "must resolve fixture root from nested cwd");

  header("2. Multi-network ingest");
  for (const c of report.contracts) {
    console.log(`    [${c.chain.padEnd(20)}] chainId=${c.chainId ?? "?"} ${c.address}  ${c.name}  abi=${c.abiHash?.slice(0, 12) ?? "(none)"}`);
  }
  assert(report.contracts.length === 3, `expected 3 contracts (2 base + 1 optimism), got ${report.contracts.length}`);

  const base = report.contracts.filter((c) => c.chain === "base-mainnet");
  const op = report.contracts.filter((c) => c.chain === "optimism-mainnet");
  assert(base.length === 2, `expected 2 base contracts, got ${base.length}`);
  assert(op.length === 1, `expected 1 optimism contract, got ${op.length}`);

  header("3. Chain ID classification");
  for (const c of base) assert(c.chainId === 8453, `base contracts must carry chainId 8453, got ${c.chainId}`);
  for (const c of op)   assert(c.chainId === 10,   `optimism contracts must carry chainId 10, got ${c.chainId}`);
  console.log("  ✓ base → 8453, optimism → 10");

  header("4. ABI hash is invariant to top-level entry reordering");
  // Synthesize an artifact with the SAME entries as base/Vault.json but reordered.
  // The hash should be identical because the canonicalizer sorts.
  const reorderDir = resolve(tmp, "reorder-test", "deployments", "base");
  mkdirSync(reorderDir, { recursive: true });
  writeFileSync(resolve(tmp, "reorder-test", "hardhat.config.js"), "module.exports = {};");
  writeFileSync(resolve(reorderDir, "Vault.json"), JSON.stringify({
    address: "0x1234567890123456789012345678901234567890",
    abi: [
      // Note: withdraw BEFORE deposit (reversed from fixture)
      { type: "function", name: "withdraw", inputs: [{ name: "shares", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
      { type: "function", name: "deposit",  inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
    ],
  }));
  const reorderReport = ingestHardhatWorkspace(resolve(tmp, "reorder-test"));
  const reorderedHash = reorderReport.contracts.find((c) => c.name === "Vault")?.abiHash;
  const originalHash  = report.contracts.find((c) => c.name === "Vault" && c.chain === "base-mainnet")?.abiHash;
  console.log(`  original:  ${originalHash}`);
  console.log(`  reordered: ${reorderedHash}`);
  assert(originalHash && reorderedHash, "both hashes must exist");
  assert(originalHash === reorderedHash, "ABI hash MUST be invariant to top-level reordering");

  header("5. Append-only across re-ingest");
  const store = new Store(dbPath);
  for (const c of report.contracts) store.write("Contract", { ...c });
  const after1 = store.count();
  console.log(`  after first ingest:  total=${after1.total}, distinct=${after1.latest}`);
  assert(after1.total === 3 && after1.latest === 3, "first ingest: 3 raw rows, 3 distinct entities");

  for (const c of report.contracts) store.write("Contract", { ...c });
  const after2 = store.count();
  console.log(`  after second ingest: total=${after2.total}, distinct=${after2.latest}`);
  assert(after2.total === 6, "re-ingest must produce v2 rows");
  assert(after2.latest === 3, "logical entity count must stay at 3");
  store.close();

  header("6. Schema rejection — malformed artifact warned, valid siblings persisted");
  const mixedDir = resolve(tmp, "mixed", "deployments", "base");
  mkdirSync(mixedDir, { recursive: true });
  writeFileSync(resolve(tmp, "mixed", "hardhat.config.js"), "module.exports = {};");
  writeFileSync(resolve(mixedDir, "Good.json"), JSON.stringify({
    address: "0xcccccccccccccccccccccccccccccccccccccccc",
    abi: [{ type: "function", name: "go", inputs: [], outputs: [] }],
  }));
  writeFileSync(resolve(mixedDir, "Bad.json"),  JSON.stringify({
    address: "not-a-real-address",
    abi: [],
  }));
  const mixed = ingestHardhatWorkspace(resolve(tmp, "mixed"));
  console.log(`  contracts parsed: ${mixed.contracts.length}`);
  console.log(`  warnings: ${mixed.warnings.length}`);
  for (const w of mixed.warnings) console.log(`    · ${w}`);
  assert(mixed.contracts.length === 1, `expected 1 valid contract, got ${mixed.contracts.length}`);
  assert(mixed.warnings.some((w) => /malformed/i.test(w) || /Skipped/i.test(w)), "expected a malformed-address warning");

  console.log("\n✅ v1.1 benchmark passed: walk-up · multi-chain · chain-ID classification · ABI hash invariance · append-only · malformed-artifact tolerance");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
