# Example 1 — DeFi vault project memory

Worked example: how an agent uses gmem while building a Solana **DeFi vault** —
a delta-neutral USDC vault that takes deposits, opens a short-perp hedge on Drift,
and returns yield from the funding rate.

The example doesn't run actual Anchor code — it demonstrates the *memory layer*
the agent would build up across sessions of working on such a project.

## Setup

```bash
# From the gmem repo:
npm install && npm run build
export GMEM_DB=/tmp/gmem-example-defi-vault.db
node dist/index.js < example.jsonl   # not really how MCP works, see below
```

In real use, the agent (Claude Code / Cursor) connects to gmem over stdio via the
MCP protocol. For demo purposes this example shows the *sequence of writes* an
agent would make, expressed as a JSON-lines list of `gmem.write` calls.

## The session

A new developer (or agent) joins the project at week 4 of a 6-week build. Without
gmem, they'd have to read the whole codebase plus ask "why did we pick X over Y"
for each major decision. With gmem, the agent calls `gmem.recall("vault")` and
gets back the full architectural context in one round-trip.

### The state gmem holds for this project (after 4 weeks of work)

**Programs**
- `vault` (devnet `Fg6PaFp…HbST`, mainnet `JUPYi…vCN`) — the vault state program
- `drift` (mainnet `dRiftyHA…GASxT`, external) — recorded as `Integration`, not `Program`

**Accounts**
- `vault_state` PDA, seeds `[b"vault", admin.key().as_ref()]`
- `vault_usdc_ata` ATA for the vault state, mint = USDC
- `drift_user` PDA owned by Drift, seeds `[b"user", vault_state.key().as_ref(), sub_account_id.to_le_bytes()]`

**Instructions**
- `initialize_vault` — admin-only, sets fee bps + cap
- `deposit` — user-callable, mints LP shares pro-rata
- `withdraw` — user-callable, burns LP shares
- `rebalance_hedge` — keeper-callable, opens/closes Drift short

**Decisions (the ones a new agent must NOT re-litigate)**
- "Use Anchor over native Rust" — IDL+macros help agent tooling
- "USDC-only deposits in v1" — multi-asset adds 3 weeks of math and 3 audit findings
- "Drift over Mango for the short leg" — Drift's funding-rate cadence (hourly) matches our rebalance budget; Mango is 8-hourly
- "No tokenized LP receipts in v1" — keep custody internal; cNFT receipts deferred to v2

**Findings (audit pre-results, 2 open)**
- `[HIGH]` `withdraw` allows partial fills below dust threshold → drains rent (open)
- `[MEDIUM]` `rebalance_hedge` can be sandwiched without slippage cap (open)
- `[LOW]` `initialize_vault` admin can be a multisig but isn't enforced (accepted-risk)

**Integrations**
- Drift v2 perps (`dRiftyHA…GASxT`) pinned at SDK v2.93
- Pyth Hermes price feeds (`pythWSnswV…`) pinned at v0.7
- Jupiter swap (`JUP6L…`) reserved for v2 multi-asset

## The agent's lookup

When the new agent picks up the project, here's what `gmem.recall("withdraw safety")` returns in one MCP call:

```json
{
  "results": [
    {
      "kind": "Finding",
      "entity": {
        "severity": "high",
        "title": "withdraw allows partial fills below dust threshold",
        "summary": "If a user calls withdraw with shares < dust limit, the program closes their LP account but leaves residual rent stranded.",
        "status": "open",
        "discoveredAt": "2026-05-08T14:00:00Z"
      },
      "score": 0.91,
      "matchedFields": ["title", "summary"]
    },
    {
      "kind": "Decision",
      "entity": {
        "title": "USDC-only deposits in v1",
        "decision": "v1 supports USDC only.",
        "rationale": "multi-asset adds 3 weeks of math and 3 audit findings; we ship USDC-only and defer mSOL/jitoSOL to v2.",
        "author": "AB12...PQR",
        "authorCluster": "mainnet-beta"
      },
      "score": 0.42,
      "matchedFields": ["rationale"]
    }
  ]
}
```

The agent now knows (a) what to fix before merge, (b) why the scope is what it is, and (c) which wallet made the call. No re-explanation needed.

## What this proves about gmem v1.0

- A real Solana DeFi project has on the order of dozens of `Program` / `Account` / `Instruction` entries, ~10 `Decision`s, and ~5–15 `Finding`s during a 6-week build. All six entity kinds in the spec are exercised.
- The `author` field (v0.4) lets the agent attribute decisions to specific developer wallets — critical when reviewing audit findings and figuring out "who did this and why."
- BM25 recall surfaces the right entities for natural-language queries an agent would actually issue ("withdraw safety", "vault architecture", "why USDC only").

See [`02-cnft-mint/`](../02-cnft-mint/) and [`03-ai-agent/`](../03-ai-agent/) for the same demonstration applied to NFT and agent projects.
