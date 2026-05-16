# Example 3 — AI agent project memory

Worked example: how an agent uses gmem while building **another Solana AI agent**.
Specifically, the project is an autonomous trading agent that watches Jupiter
swaps, decides when to enter a position, signs and submits via the user's
delegated keypair, and records its reasoning on-chain.

This is the most meta example: gmem helping an agent build an agent. But it's
also the most realistic — it's exactly the workflow Yoshi's Holder Hunt + Mirror
+ Jupiter AI Trading Agent stack uses today (see <https://github.com/yksanjo>).

## The state gmem holds for this project

**Programs**
- `trader_router` (devnet `Tr8de…Ag7t`, mainnet `T8X…rQa`) — owns user's delegated authority + per-strategy state

**Accounts**
- `user_strategy` PDA, seeds `[b"strategy", user.key().as_ref(), strategy_id.to_le_bytes()]`
- `delegation_authority` PDA, seeds `[b"delegate", user.key().as_ref()]` — limited-scope signer the agent uses
- `pyth_eth_feed` external account `JBu1AL…CTQg` (Pyth Hermes ETH/USD)
- `trade_log` PDA per-trade, seeds `[b"trade", user_strategy.key().as_ref(), trade_id.to_le_bytes()]`

**Instructions**
- `init_strategy` — user signs once, sets max position, allowed mints, allowed venues
- `delegate_auth` — user signs once, grants the agent limited-scope signing for `enter` / `exit`
- `enter` — agent-callable, requires `delegation_authority` signature, opens position via Jupiter swap
- `exit` — agent-callable, closes position back to USDC
- `revoke` — user-callable, kills the delegation

**Decisions (this is where gmem shines for agent projects)**
- "Limited delegation, not full custody" — user retains keys; agent gets a scoped signer that can only call `enter` and `exit` for *this* strategy account, never `revoke` or transfer
- "On-chain trade log per-trade, not aggregated" — sigh-event logs cost ~$0.001 per trade in rent; the per-trade audit trail is worth it for the agent's own reasoning replay
- "Pyth Hermes (pull) over Pyth legacy (push)" — pull oracles match agent execution cadence; push oracles wasted compute units on every poke
- "Jupiter swap exclusively for v1" — Drift / perps deferred until we have the funding-rate math from [`01-defi-vault/`](../01-defi-vault/)
- "Agent's reasoning is stored as gmem Decision entries, not on-chain" — too expensive to put 200-word rationales in transaction memo; gmem holds them, on-chain only carries the trade hash

**Findings**
- `[CRITICAL]` `delegate_auth` didn't check that `delegation_authority` PDA was uninitialized — re-running the instruction could overwrite an active delegation with new permissions (fixed)
- `[HIGH]` `enter` instruction trusted client-side slippage; replaced with on-chain Jupiter route hash verification (fixed)
- `[MEDIUM]` `revoke` has no event log — user can't audit when they revoked (open)

**Integrations**
- Jupiter Swap (`JUP6L…`) pinned at v6 API
- Pyth Hermes (`pythWSnswV…`) pinned at v0.7
- gmem itself, used to store the agent's reasoning trace per trade

## The self-referential payoff

This example uses gmem to store the agent's reasoning. So when the agent comes
back tomorrow and asks "why did we exit ETH at $3,420?", gmem returns:

```json
{
  "kind": "Decision",
  "entity": {
    "title": "Exit ETH-USDC position trade-id 412",
    "decision": "Closed long at $3,420 for +1.2% gain.",
    "rationale": "Pyth's 1-minute funding-pressure indicator flipped negative for 3 consecutive minutes; our entry rationale was funding-positive momentum; condition violated.",
    "date": "2026-05-15T22:14:09Z",
    "author": "DEPubkeyOfDelegationAuthority...",
    "authorCluster": "mainnet-beta",
    "relatedTo": [{ "kind": "Account", "id": "trade_412_pda_address" }]
  }
}
```

The agent's reasoning is durable across sessions, attributable to the delegated
authority pubkey, linked to the actual on-chain `trade_log` PDA. **The agent
becomes auditable**.

This is the use case the Solana Foundation grant funded gmem to enable.
