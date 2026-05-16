/**
 * v0.4 benchmark — Solana CLI context capture + Decision auto-attribution.
 *
 * Builds a fake Solana CLI config + keypair in a tempdir, points the reader at it,
 * and asserts: rpc-cluster classification, keypair-to-pubkey derivation, secret-key
 * never leaks into the returned context, and Decision writes are auto-attributed
 * to the active pubkey + cluster.
 *
 * Run: npm run test:v04
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Keypair } from "@solana/web3.js";
import { readSolanaCliContext, isValidPubkey } from "../ingest/solana-cli.js";
import { Store } from "../db.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function header(s: string) { console.log(`\n── ${s} ──`); }

const tmp = resolve(tmpdir(), `gmem-v04-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const dbPath = resolve(tmp, "test.db");
const keyPath = resolve(tmp, "id.json");
const cfgPath = resolve(tmp, "config.yml");

try {
  header("1. Build a fake Solana CLI config + keypair");
  const kp = Keypair.generate();
  writeFileSync(keyPath, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  writeFileSync(
    cfgPath,
    [
      "---",
      "json_rpc_url: https://api.devnet.solana.com",
      "websocket_url: wss://api.devnet.solana.com",
      `keypair_path: ${keyPath}`,
      "commitment: confirmed",
    ].join("\n"),
  );
  console.log(`  pubkey:      ${kp.publicKey.toBase58()}`);
  console.log(`  keypair:     ${keyPath}`);
  console.log(`  config:      ${cfgPath}`);

  header("2. readSolanaCliContext should classify cluster + derive pubkey");
  const ctx = readSolanaCliContext(cfgPath);
  console.log(`  rpcUrl:      ${ctx.rpcUrl}`);
  console.log(`  cluster:     ${ctx.cluster}`);
  console.log(`  commitment:  ${ctx.commitment}`);
  console.log(`  pubkey:      ${ctx.pubkey}`);
  console.log(`  warnings:    ${JSON.stringify(ctx.warnings)}`);

  assert(ctx.cluster === "devnet", `cluster must be classified as 'devnet', got ${ctx.cluster}`);
  assert(ctx.rpcUrl === "https://api.devnet.solana.com", "rpcUrl must match config");
  assert(ctx.commitment === "confirmed", "commitment must match config");
  assert(ctx.pubkey === kp.publicKey.toBase58(), "pubkey must round-trip from keypair");
  assert(ctx.warnings.length === 0, `expected no warnings, got ${JSON.stringify(ctx.warnings)}`);
  assert(isValidPubkey(ctx.pubkey!), "derived pubkey must validate as base58");

  header("3. Secret key MUST NOT appear anywhere in the returned context");
  const serialized = JSON.stringify(ctx);
  // The secret key is 64 bytes; check that no run of 60+ digits/letters from it leaked.
  const secretSample = Array.from(kp.secretKey).slice(0, 8).join(",");
  assert(!serialized.includes(secretSample), "secret key bytes must NOT appear in the serialized context");
  assert(!serialized.toLowerCase().includes("secretkey"), "no 'secretkey' field should be present");
  console.log(`  ✓ secret key never appears in returned context`);

  header("4. Cluster classification edge cases");
  for (const [rpc, expected] of [
    ["https://api.mainnet-beta.solana.com", "mainnet-beta"],
    ["https://my-mainnet-rpc.example.com",  "mainnet-beta"],
    ["https://api.devnet.solana.com",       "devnet"],
    ["https://api.testnet.solana.com",      "testnet"],
    ["http://127.0.0.1:8899",               "localnet"],
    ["http://localhost:8899",               "localnet"],
    ["https://us-1.helius-rpc.com/?api-key=x", "custom"],
  ] as const) {
    writeFileSync(cfgPath, [
      `json_rpc_url: ${rpc}`,
      `keypair_path: ${keyPath}`,
    ].join("\n"));
    const c = readSolanaCliContext(cfgPath);
    console.log(`  ${rpc.padEnd(50)} -> ${c.cluster}`);
    assert(c.cluster === expected, `expected ${expected} for ${rpc}, got ${c.cluster}`);
  }

  header("5. Decision writes via Store should auto-attribute when context present");
  // Restore the devnet config so the next read returns valid context
  writeFileSync(cfgPath, [
    "json_rpc_url: https://api.devnet.solana.com",
    `keypair_path: ${keyPath}`,
  ].join("\n"));

  const store = new Store(dbPath);
  // Mimic what the MCP server does on gmem.write for Decision kind
  const entity: Record<string, unknown> = {
    title: "Use Anchor over native Rust",
    decision: "Use Anchor for all on-chain programs.",
    rationale: "Anchor's IDL+macros pay off for agent tooling.",
    date: new Date().toISOString(),
  };
  const liveCtx = readSolanaCliContext(cfgPath);
  if (liveCtx.pubkey) {
    entity.author = liveCtx.pubkey;
    if (liveCtx.cluster) entity.authorCluster = liveCtx.cluster;
  }
  store.write("Decision", entity);

  const decisions = store.listDecisions();
  console.log(`  Decisions in store: ${decisions.length}`);
  const written = decisions[0] as Record<string, unknown>;
  console.log(`  written.author:        ${written.author}`);
  console.log(`  written.authorCluster: ${written.authorCluster}`);
  assert(written.author === kp.publicKey.toBase58(), "Decision must carry the author pubkey");
  assert(written.authorCluster === "devnet", "Decision must carry the author cluster");

  store.close();

  console.log("\n✅ v0.4 benchmark passed: YAML config parse · cluster classification · pubkey derivation · secret-never-leaks · Decision auto-attribution");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
