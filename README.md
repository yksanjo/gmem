# gmem

**Persistent project memory for Solana AI agents.**

A Model Context Protocol (MCP) server that gives AI coding agents — Claude Code, Cursor,
or anything that speaks MCP — durable, Solana-aware memory of a project across sessions:
program IDs, IDLs, PDA seeds, deployment state, architectural decisions, audit findings.
So agents stop forgetting what they built yesterday.

Status: **v1.1 — stable, with EVM support.**
Seven MCP tools, real implementations (no stubs), backward-compatible wire format:
- Storage: SQLite via better-sqlite3, one db file per project (auto-resolved from
  `Anchor.toml` / workspace `Cargo.toml`, override with `GMEM_DB`)
- Ranking: SQLite FTS5 BM25 with a recency boost
- Versioning: append-only — every write inserts a new `(kind, natural_id, version)` row;
  reads return the latest; full history available via the in-process `Store` API
- Anchor ingest: `gmem.ingest_anchor` parses `Anchor.toml`, captures IDL sha256s,
  records git HEAD as `sourceCommit` per Program
- Solana CLI context: `gmem.solana_context` reads `~/.config/solana/cli/config.yml`,
  classifies the cluster, derives the active keypair's pubkey (secret never leaks).
  `gmem.write` on a Decision auto-attributes `author` + `authorCluster`
- Git-aware diff: `gmem.diff` accepts both ISO timestamps and git refs (HEAD, HEAD~3,
  branch names, full and short SHAs)
- EVM support (v1.1): `gmem.ingest_hardhat` parses Hardhat / `hardhat-deploy` workspaces,
  classifies networks into canonical chain ids (base-mainnet 8453, optimism-mainnet 10,
  polygon-mainnet 137, arbitrum-one 42161, ethereum-mainnet 1, plus testnets), captures
  a reorder-invariant ABI SHA-256. New `Contract` entity kind for EVM smart contracts.

- License: MIT
- Spec: see [`SPEC.md`](./SPEC.md)
- Entity schemas: see [`schema/`](./schema/)

## Why

Solana has moved decisively toward an agent-first developer experience. The Foundation's
`awesome-solana-ai` repo indexes a strong layer of *stateless* reference skills —
`solana-dev-skill`, `magicblock-dev-skill`, `metaplex-skill`, `helius-phantom-skill`,
`solana-game-skill`, and more — that teach agents *how* to do things. The Solana
Developer MCP exposes documentation. What's missing is the layer above: **persistent
project memory.**

Today every Claude Code session on a Solana project starts cold. The agent doesn't
remember the program ID it deployed yesterday, the PDA seeds it chose two weeks ago, the
audit finding from last sprint, or why a specific Jupiter integration was rejected. The
developer compensates by pasting context, hand-maintaining NOTES files, or re-explaining
the project every session. That is a tax on every agent-assisted Solana developer.

gmem fixes this by being **opinionated about Solana primitives** — programs, accounts,
instructions, PDAs, IDLs, cluster state, Anchor configs — rather than being a generic
key-value store. It complements every existing skill in `awesome-solana-ai` rather than
competing with any of them.

## Install

```bash
npm install -g @yksanjo/gmem
```

Or, to run it without a global install:

```bash
npx @yksanjo/gmem
```

The installed binary is still called `gmem`.

Or, to hack on the source:

```bash
git clone https://github.com/yksanjo/gmem.git ~/gmem
cd ~/gmem && npm install && npm run build
```

Then point your MCP client at it. For Claude Code:

```jsonc
// ~/.claude/mcp_servers.json
{
  "mcpServers": {
    "gmem": {
      "command": "node",
      "args": ["/absolute/path/to/gmem/dist/index.js"],
      "env": { "GMEM_DB": "~/.gmem/memory.db" }
    }
  }
}
```

## Tools exposed (v0.1)

| Tool | Purpose |
| ---- | ------- |
| `gmem.recall(query)` | Retrieve memory entries relevant to a natural-language query, ranked by BM25 + recency |
| `gmem.write(entity)` | Persist a typed memory entry (Program / Account / Instruction / Decision / Finding / Integration); append-only |
| `gmem.diff(from, to)` | Show how memory state changed between two points in time — accepts ISO timestamps OR git commit refs (HEAD, HEAD~3, branch names, full or short SHAs) |
| `gmem.list_decisions()` | List all `Decision` entries for the active project, newest first |
| `gmem.ingest_anchor()` | Auto-ingest an Anchor workspace: parse `Anchor.toml`, capture IDL sha256s from `target/idl/`, record the current git HEAD as source commit, write one Program per (program, cluster) pair |
| `gmem.solana_context()` | Read the active Solana CLI config (`~/.config/solana/cli/config.yml`), return the configured cluster + RPC URL + active-keypair pubkey. Used by `gmem.write` to auto-attribute Decision entries to the developer wallet. Never returns the secret key. |
| `gmem.ingest_hardhat()` | **v1.1** — Auto-ingest a Hardhat / EVM workspace: parses `hardhat.config.{ts,js,cjs,mjs}`, reads every deployment artifact under `deployments/<network>/<Contract>.json` (the hardhat-deploy convention), classifies the network into a canonical chain (base-mainnet, optimism-mainnet, etc.), records a reorder-invariant ABI SHA-256 and git HEAD as `sourceCommit`. Writes one Contract entity per (chain, address) pair. |

Full input/output JSON schemas are in [`SPEC.md`](./SPEC.md).

## Out of scope for v1.0

To keep the v1 scope honest, gmem v1.0 does NOT include: hosted multi-user sync,
cross-project search, agent reputation, on-chain memory anchoring. These are tracked in
[`ROADMAP.md`](./ROADMAP.md) for v1.x / v2.

## Roadmap

- [x] v0.1 — Open spec + JSON schemas + MCP server stub
- [x] v0.2 — SQLite backend, BM25 ranking, append-only versioning
- [x] v0.3 — Anchor workspace auto-ingest
- [x] v0.4 — Solana CLI context capture + Decision auto-attribution
- [x] v0.5 — git ref resolution in `gmem.diff`
- [x] v1.0 — Stable release with three worked examples ([DeFi vault](./examples/01-defi-vault/),
  [cNFT mint](./examples/02-cnft-mint/), [AI agent](./examples/03-ai-agent/)) — see also
  [PR #168 in `solana-foundation/awesome-solana-ai`](https://github.com/solana-foundation/awesome-solana-ai/pull/168)
- [x] v1.1 — EVM / Hardhat support (Base, Optimism, Polygon, Arbitrum, Ethereum, plus testnets),
  new `Contract` entity, `gmem.ingest_hardhat` tool, [worked example 04-evm-vault](./examples/04-evm-vault/)

## Contributing

This is an early-stage spec. The most useful thing right now is feedback on
[`SPEC.md`](./SPEC.md) — does the entity model cover the Solana primitives that matter
to *your* project? Open an issue or PR.

## License

MIT — see [`LICENSE`](./LICENSE).
