# Example 5 — Agent reputation at the edge

Worked example for **gmem v1.2+**: scoring autonomous-agent wallets so other
agents (and the humans paying them) can decide whether to transact.

This example exists because — as of v1.2 — gmem speaks "agent." When agent A
pays agent B over x402 or any other agent-to-agent payment rail, neither side
is "reputational." Bloomberg doesn't rate them. Chainalysis rates wallets, not
agents. gmem v1.2 fills that gap with a transparent, on-chain-evidence-based
trust score that fits behind a payment guardrail.

The product modeled here: a swap-execution agent that refuses to settle when
the counterparty's trust score falls below a configurable threshold.

## The state gmem holds for this project

**Agents** (new in v1.2 — pubkey + cluster + observed activity + score)

| Cluster        | Pubkey                            | Name                  | Score | Why                                                |
| -------------- | --------------------------------- | --------------------- | ----- | -------------------------------------------------- |
| `mainnet-beta` | `Agent11111111111111111111111111111` | sample-agent          | 63.9  | 10 txs, 3 peers, 9mo old, 20% failure              |
| `mainnet-beta` | `BadPeer11111111111111111111111111`  | sanctioned-counterparty | 22.4  | sanctioned-list match, low activity                |
| `mainnet-beta` | `Peer1111111111111111111111111111`   | trusted-counterparty    | 71.2  | 4 txs with sample-agent, 9mo cohabitation history  |

Each row carries: base58 pubkey, Solana cluster, optional human name,
observed-activity aggregates (txCount, peerCount, failureRatio, age window),
sanctioned-neighbor count, the score itself, and the breakdown explaining
which factors moved it. Append-only — re-scoring writes a new version, never
overwrites, so you can audit how an agent's trust has drifted over time.

**Decisions** (the human policy choices behind the score)

- "Heuristic v1 over LLM-judge for the first scorer" — buyers (especially banks
  and CDP-style facilitators) demand to see the formula before they'll wire a
  score into a payment guardrail. Black-box scores lose the design-partner
  pitch. LLM-judge layers on top in v1.3.
- "Threshold 60 by default in payment guardrails" — lets mid-quality wallets
  through while reliably blocking sanctioned-neighbor cases (which drop the
  score by 25 per neighbor). Tune per use case.
- "Sanctioned-neighbor list is caller-supplied in v1.2" — future versions hook
  OFAC + Chainalysis feeds, but v1 keeps the trust boundary explicit so users
  understand exactly what's being checked.

**Findings**

- `[CRITICAL]` `BadPeer11111111111111111111111111` is flagged on the
  caller-supplied sanctions list — every interaction propagates a `-25` to any
  counterparty's score
- `[HIGH]` `sample-agent` shows a 20% failure rate; investigate before raising
  the trust threshold above 70
- `[INFO]` `sample-agent` has a 9-month activity window — the age boost is
  near its `+10` cap, so additional age won't move the score further

**Integrations**

- Helius RPC (`mainnet.helius-rpc.com`) — the v1.2 ingest source for Solana
  wallet activity. Set `HELIUS_API_KEY` to run live, or pass `fixturePath`
  for offline tests.
- Sanctions list — caller-supplied in v1.2 (`sanctionedList: string[]` on
  `gmem.ingest_agent_activity`); future hooks OFAC + Chainalysis.

## How an agent uses gmem here

When a swap-execution agent sees a counterparty pubkey in a message:

```
gmem.score_agent({ pubkey: "BadPeer11111111111111111111111111", cluster: "mainnet-beta" })
→ score: 22.4, scoreReasoning: "base 50, +0 from 0 txs, ... -25 from 1 sanctioned neighbor(s), = 22.4"

if (result.score < 60) {
  // refuse the swap; surface the breakdown to the user
  return { ok: false, refused: true, evidence: result.breakdown };
}
```

If the counterparty has never been ingested:

```
gmem.ingest_agent_activity({ pubkey, cluster: "mainnet-beta", limit: 100 })
→ pulls Helius activity, computes score, writes an Agent entity (v1)

gmem.score_agent({ pubkey, cluster: "mainnet-beta" })
→ now returns the freshly-computed score + breakdown
```

For batched, periodic ingestion of known counterparties (e.g. nightly refresh
of the agent's payment-allowlist), wrap the loop in a cron and let
append-only versioning preserve the history of every score change.

## What this proves

- **Trust is local, not centralized.** gmem doesn't depend on an external
  reputation API. The score is computed from on-chain evidence the caller
  can audit themselves.
- **The formula is in the open.** `src/score/agent.ts` is 100 lines, no LLM,
  no closed model. If you don't agree with the weighting, fork and re-tune.
- **Append-only history is a feature.** A wallet that was clean in March and
  picked up a sanctioned neighbor in May shows two distinct versions in
  `gmem.history("Agent", "mainnet-beta:...")` — the regression is visible.

## Run the demo

The same fixture used in the v1.2 test suite is the easiest way to see this
end-to-end. From the gmem repo root:

```bash
npm install
npm run test:v12
```

This runs `src/scripts/test-v12.ts` against `fixtures/helius-agent/sample.json`
and prints the score breakdown for both a clean ingest and one with a
sanctioned-neighbor list, showing the 25-point drop.

To run against a real wallet on mainnet, set `HELIUS_API_KEY` and call the MCP
tool from any MCP-capable agent (Claude Code, Cursor, etc.):

```json
{
  "method": "tools/call",
  "params": {
    "name": "gmem.ingest_agent_activity",
    "arguments": {
      "pubkey": "<base58 pubkey>",
      "cluster": "mainnet-beta",
      "limit": 100,
      "sanctionedList": ["<known-bad-pubkey>", "..."]
    }
  }
}
```

Then `gmem.score_agent` with the same pubkey to retrieve the breakdown.

## See also

- [`SPEC.md`](../../SPEC.md) — the full entity model
- [`ROADMAP.md`](../../ROADMAP.md) — what's next (v1.3 LLM-judge scorer)
- `src/score/agent.ts` — the heuristic, in 100 lines
- `src/ingest/helius.ts` — the RPC client + offline fixture mode
