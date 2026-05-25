# gmem roadmap

Tracked deliverables for the v1.0 cycle, mapped to the Solana Foundation grant milestones.

| # | Milestone | Output | Status | Target |
| - | --------- | ------ | ------ | ------ |
| 1 | Spec & schema | This repo's `SPEC.md` + `schema/*.json` + stub MCP server | ✅ shipped v0.1 (2026-05-16) | 2026-W21 |
| 2 | v0.2 — SQLite implementation | Working server: all 4 tools real, BM25 recall, append-only versioning | ✅ shipped v0.2 (2026-05-16) | 2026-W23 |
| 3 | v0.3 — Anchor auto-ingest | `Anchor.toml` parser, IDL hash capture, deploy artifact ingestion | ✅ shipped v0.3 (2026-05-16) | 2026-W25 |
| 4 | v0.4 — Solana CLI context | Active keypair + cluster capture, signed `Decision` entries | ✅ shipped v0.4 (2026-05-16) | 2026-W26 |
| 5 | v0.5 — Git linkage | `gmem.diff` against arbitrary commits, JSONL memory log alongside SQLite | ✅ shipped v0.5 (2026-05-16) — `gmem.diff` resolves HEAD / HEAD~N / branches / full+short SHAs into ISO timestamps via `git show -s --format=%cI`. JSONL log deferred to v1.x. | 2026-W27 |
| 6 | v1.0 — Stable release | 3 worked examples (DeFi / NFT / agent), tagged release, PR into `solana-foundation/awesome-solana-ai` | ✅ shipped v1.0 (2026-05-16) — three worked examples in `examples/`, PR #168 open at `solana-foundation/awesome-solana-ai` | 2026-W28 |
| 7 | v1.1 — EVM support | Hardhat `deployments/` ingest, new `Contract` entity, multi-chain classification (Base / Optimism / Polygon / Arbitrum / Ethereum / testnets) | ✅ shipped v1.1 (2026-05-17) — `gmem.ingest_hardhat` tool, `examples/04-evm-vault/`, full test suite green. Unlocks eligibility for Base Builder Grants, Optimism RetroPGF, Polygon CGP. | 2026-W29 |
| 8 | v1.2 — Agent reputation at the edge | New `Agent` entity, Helius wallet-activity ingest, transparent v1 heuristic trust score (`v1-heuristic` scoreVersion), two new tools: `gmem.ingest_agent_activity` + `gmem.score_agent`. Offline fixture mode for CI. The missing trust layer for agent-to-agent payments — read API designed to wrap into x402 facilitators (Coinbase CDP, x402.org) and agent frameworks (ElizaOS, AgentKit). | ✅ shipped v1.2 (2026-05-25) | 2026-W30 |

## Beyond v1

Things explicitly OUT of v1 scope, captured here so they don't keep showing up as PRs:

- Hosted multi-user sync (would invalidate the local-first, no-cloud-dependency principle)
- Cross-project search (one project at a time, on purpose)
- v2-llm-judge scorer that reads transaction narratives with Claude (deferred to v1.3 — heuristic v1 ships first because buyers will demand to see the formula)
- On-chain memory anchoring (interesting; deferred until a use case demands it)
- Generative summarization of memory entries (raw entities first, summaries on top later)
- A Postgres backend (drafted in `SPEC.md` §2 but not v1)
- SVM-extension chain support (Sonic, Eclipse, MagicBlock) — schema designed to accept it; first extension contributed by an external maintainer or with a separate grant from that ecosystem
