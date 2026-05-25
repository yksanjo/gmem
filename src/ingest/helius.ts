/**
 * Helius agent-activity ingest — Milestone v1.2.
 *
 * Pulls Solana wallet activity for a specific agent pubkey via Helius RPC,
 * aggregates it into a single Agent entity, and lets the v1 heuristic
 * scorer compute a trust score over the result.
 *
 * Two execution modes:
 *   - LIVE:    fetches getSignaturesForAddress + getTransaction batch from
 *              `https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY`
 *   - FIXTURE: reads a pre-canned JSON file `{ signatures: [...], transactions: [...] }`
 *              so the test suite never depends on a live network or a paid API key
 *
 * No private-key access. No write operations on Solana. Read-only by design.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ─────────────────────────────────────────────────────────────────────────
 *  Public shapes
 * ───────────────────────────────────────────────────────────────────────── */

export interface IngestedAgent {
  pubkey: string;
  cluster: "mainnet-beta" | "devnet" | "testnet" | "localnet";
  firstSeen?: string;
  lastSeen?: string;
  txCount: number;
  peerCount: number;
  failureRatio: number;
  sanctionedNeighborCount: number;
}

export interface HeliusIngestReport {
  agent: IngestedAgent;
  /** Distinct counterparty pubkeys seen in the ingest window. Surface for downstream graphs. */
  peers: string[];
  warnings: string[];
  /** Which mode produced the report — handy for tests + provenance. */
  source: "live" | "fixture";
}

export interface IngestOptions {
  pubkey: string;
  cluster?: "mainnet-beta" | "devnet" | "testnet" | "localnet";
  /** Max signatures to scan. Helius caps at 1000 per page; we default to 100. */
  limit?: number;
  /** Pre-canned response file (skip the live call). Used by tests. */
  fixturePath?: string;
  /** Helius API key. Falls back to HELIUS_API_KEY env. */
  apiKey?: string;
  /** Pubkeys to flag as sanctioned counterparties. Future: hook OFAC/Chainalysis feed. */
  sanctionedList?: readonly string[];
}

/* ─────────────────────────────────────────────────────────────────────────
 *  RPC shapes (only the subset we read)
 * ───────────────────────────────────────────────────────────────────────── */

interface SigInfo {
  signature: string;
  slot: number;
  err: unknown | null;
  blockTime: number | null;
}

interface TxInfo {
  transaction: {
    message: {
      accountKeys: string[] | { pubkey: string; signer?: boolean; writable?: boolean }[];
    };
  };
  meta: { err: unknown | null } | null;
  blockTime: number | null;
}

interface FixtureFile {
  signatures: SigInfo[];
  transactions: TxInfo[];
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Entry point
 * ───────────────────────────────────────────────────────────────────────── */

export async function ingestAgentActivity(opts: IngestOptions): Promise<HeliusIngestReport> {
  const cluster = opts.cluster ?? "mainnet-beta";
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  const warnings: string[] = [];

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(opts.pubkey)) {
    throw new Error(`Invalid base58 pubkey: ${opts.pubkey}`);
  }

  let signatures: SigInfo[];
  let transactions: TxInfo[];
  let source: "live" | "fixture";

  if (opts.fixturePath) {
    const fixture = JSON.parse(readFileSync(resolve(opts.fixturePath), "utf8")) as FixtureFile;
    signatures = fixture.signatures.slice(0, limit);
    transactions = fixture.transactions.slice(0, limit);
    source = "fixture";
  } else {
    const apiKey = opts.apiKey ?? process.env.HELIUS_API_KEY;
    if (!apiKey) {
      throw new Error("Live Helius ingest requires HELIUS_API_KEY env or `apiKey` option. Pass `fixturePath` for offline use.");
    }
    const endpoint = clusterEndpoint(cluster, apiKey);
    signatures = await rpcGetSignatures(endpoint, opts.pubkey, limit);
    if (signatures.length === 0) {
      warnings.push(`No signatures observed for ${opts.pubkey} on ${cluster}.`);
    }
    transactions = await rpcGetTransactionBatch(endpoint, signatures.map((s) => s.signature));
    source = "live";
  }

  const agent = aggregate(opts.pubkey, cluster, signatures, transactions, opts.sanctionedList ?? []);
  const peers = distinctPeers(opts.pubkey, transactions);

  return { agent, peers, warnings, source };
}

/* ─────────────────────────────────────────────────────────────────────────
 *  Aggregation
 * ───────────────────────────────────────────────────────────────────────── */

function aggregate(
  pubkey: string,
  cluster: IngestedAgent["cluster"],
  sigs: SigInfo[],
  txs: TxInfo[],
  sanctioned: readonly string[],
): IngestedAgent {
  const txCount = sigs.length;
  const failed = sigs.filter((s) => s.err != null).length;
  const failureRatio = txCount === 0 ? 0 : failed / txCount;

  const peers = distinctPeers(pubkey, txs);
  const peerCount = peers.length;

  const sanctionedSet = new Set(sanctioned);
  const sanctionedNeighborCount = peers.filter((p) => sanctionedSet.has(p)).length;

  const blockTimes = sigs.map((s) => s.blockTime).filter((t): t is number => typeof t === "number" && t > 0);
  const firstSeen = blockTimes.length ? new Date(Math.min(...blockTimes) * 1000).toISOString() : undefined;
  const lastSeen = blockTimes.length ? new Date(Math.max(...blockTimes) * 1000).toISOString() : undefined;

  return {
    pubkey,
    cluster,
    firstSeen,
    lastSeen,
    txCount,
    peerCount,
    failureRatio,
    sanctionedNeighborCount,
  };
}

function distinctPeers(pubkey: string, txs: TxInfo[]): string[] {
  const set = new Set<string>();
  for (const tx of txs) {
    const keys = tx.transaction?.message?.accountKeys ?? [];
    for (const k of keys) {
      const addr = typeof k === "string" ? k : k.pubkey;
      if (typeof addr === "string" && addr !== pubkey) set.add(addr);
    }
  }
  return [...set];
}

/* ─────────────────────────────────────────────────────────────────────────
 *  RPC helpers (live mode)
 * ───────────────────────────────────────────────────────────────────────── */

function clusterEndpoint(cluster: IngestedAgent["cluster"], apiKey: string): string {
  switch (cluster) {
    case "mainnet-beta": return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    case "devnet":       return `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
    case "testnet":      return `https://api.testnet.solana.com`;
    case "localnet":     return `http://127.0.0.1:8899`;
  }
}

interface RpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const body = (await res.json()) as RpcResponse<T>;
  if (body.error) throw new Error(`RPC ${method} error: ${body.error.message}`);
  if (body.result === undefined) throw new Error(`RPC ${method} returned no result`);
  return body.result;
}

async function rpcGetSignatures(endpoint: string, pubkey: string, limit: number): Promise<SigInfo[]> {
  return rpcCall<SigInfo[]>(endpoint, "getSignaturesForAddress", [pubkey, { limit }]);
}

async function rpcGetTransactionBatch(endpoint: string, signatures: string[]): Promise<TxInfo[]> {
  // Helius supports JSON-RPC batch requests; do them in chunks of 25 to stay
  // under any default request-size cap.
  const out: TxInfo[] = [];
  const chunkSize = 25;
  for (let i = 0; i < signatures.length; i += chunkSize) {
    const chunk = signatures.slice(i, i + chunkSize);
    const batch = chunk.map((sig, idx) => ({
      jsonrpc: "2.0",
      id: i + idx,
      method: "getTransaction",
      params: [sig, { maxSupportedTransactionVersion: 0, encoding: "json" }],
    }));
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`RPC batch HTTP ${res.status}`);
    const body = (await res.json()) as RpcResponse<TxInfo>[];
    for (const r of body) {
      if (r.result) out.push(r.result);
    }
  }
  return out;
}
