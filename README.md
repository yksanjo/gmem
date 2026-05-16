# gmem

**Persistent project memory for Solana AI agents.**

A Model Context Protocol (MCP) server that gives AI coding agents — Claude Code, Cursor,
or anything that speaks MCP — durable, Solana-aware memory of a project across sessions:
program IDs, IDLs, PDA seeds, deployment state, architectural decisions, audit findings.
So agents stop forgetting what they built yesterday.

Status: **pre-release.** Spec frozen at v0.1. Server stub boots and responds to all four
core tools with deterministic placeholder data. SQLite-backed implementation lands at
Milestone 2.

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

> Not on npm yet — install from this repo while v0.1 stabilizes.

```bash
git clone https://github.com/[org]/gmem.git ~/gmem
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
| `gmem.recall(query)` | Retrieve memory entries relevant to a natural-language query, ranked by recency and similarity |
| `gmem.write(entity)` | Persist a typed memory entry (Program / Account / Instruction / Decision / Finding / Integration) |
| `gmem.diff(commit_a, commit_b)` | Show how memory state changed between two git commits of the project |
| `gmem.list_decisions()` | List all `Decision` entries for the active project, newest first |

Full input/output JSON schemas are in [`SPEC.md`](./SPEC.md).

## Out of scope for v1.0

To keep the v1 scope honest, gmem v1.0 does NOT include: hosted multi-user sync,
cross-project search, agent reputation, on-chain memory anchoring. These are tracked in
[`ROADMAP.md`](./ROADMAP.md) for v1.x / v2.

## Roadmap

- [x] v0.1 — Open spec + JSON schemas + MCP server stub (this commit)
- [ ] v0.2 — SQLite-backed implementation of all four core tools
- [ ] v0.3 — Anchor workspace auto-ingest (`Anchor.toml`, IDLs, `target/deploy`)
- [ ] v0.4 — Solana CLI context (active keypair, cluster) auto-capture
- [ ] v0.5 — Git linkage so memory is versioned with code
- [ ] v1.0 — Stable release, 3 worked examples (DeFi / NFT / agent), PR into `awesome-solana-ai`

## Contributing

This is an early-stage spec. The most useful thing right now is feedback on
[`SPEC.md`](./SPEC.md) — does the entity model cover the Solana primitives that matter
to *your* project? Open an issue or PR.

## License

MIT — see [`LICENSE`](./LICENSE).
