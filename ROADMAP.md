# gmem roadmap

Tracked deliverables for the v1.0 cycle, mapped to the Solana Foundation grant milestones.

| # | Milestone | Output | Status | Target |
| - | --------- | ------ | ------ | ------ |
| 1 | Spec & schema | This repo's `SPEC.md` + `schema/*.json` + stub MCP server | ✅ shipped v0.1 (2026-05-16) | 2026-W21 |
| 2 | v0.2 — SQLite implementation | Working server: all 4 tools real, BM25 recall, append-only versioning | ✅ shipped v0.2 (2026-05-16) | 2026-W23 |
| 3 | v0.3 — Anchor auto-ingest | `Anchor.toml` parser, IDL hash capture, deploy artifact ingestion | 🔜 | 2026-W25 |
| 4 | v0.4 — Solana CLI context | Active keypair + cluster capture, signed `Decision` entries | 🔜 | 2026-W26 |
| 5 | v0.5 — Git linkage | `gmem.diff` against arbitrary commits, JSONL memory log alongside SQLite | 🔜 | 2026-W27 |
| 6 | v1.0 — Stable release | 3 worked examples (DeFi / NFT / agent), tagged release, PR into `solana-foundation/awesome-solana-ai` | 🔜 | 2026-W28 |

## Beyond v1

Things explicitly OUT of v1 scope, captured here so they don't keep showing up as PRs:

- Hosted multi-user sync (would invalidate the local-first, no-cloud-dependency principle)
- Cross-project search (one project at a time, on purpose)
- Agent reputation / signed writes (real once on-chain agent ID matures)
- On-chain memory anchoring (interesting; deferred until a use case demands it)
- Generative summarization of memory entries (raw entities first, summaries on top later)
- A Postgres backend (drafted in `SPEC.md` §2 but not v1)
- SVM-extension chain support (Sonic, Eclipse, MagicBlock) — schema designed to accept it; first extension contributed by an external maintainer or with a separate grant from that ecosystem
