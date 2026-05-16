# Agentic Engineering Grant — Application (copy-paste ready)

**Submit at:** https://superteam.fun/earn/grants/agentic-engineering
**Reward:** 200 USDG (50% upfront on approval, 50% on shipping)
**Applicant:** Yoshi Kondo (yksanjo)

---

## Step 1: Basics

**Project Title**

> gmem — Persistent Project Memory for Solana AI Agents

**One Line Description**

> A Model Context Protocol (MCP) server that gives Solana AI coding agents persistent, schema-typed memory of program IDs, IDLs, PDA seeds, deployment state, and architectural decisions across sessions — so agents stop forgetting what they built yesterday.

**TG username**

> t.me/yksanjo

**Wallet Address**

> 4oACGWGh7zeWTHqESC8yxMXpn8x2TzKodUxkQ7MarfD3

---

## Step 2: Details

**Project Details**

> Every Claude Code or Cursor session on a Solana project starts cold. The agent doesn't remember the program ID it deployed yesterday, the PDA seeds chosen two weeks ago, the IDL it just iterated on, or why a Jupiter integration was rejected three sessions back. Developers compensate by pasting context into every prompt, hand-maintaining NOTES files, or simply re-explaining the project. This is a tax on every agent-assisted Solana developer, and it grows quadratically with project complexity.
>
> gmem fixes this with a Model Context Protocol server that's opinionated about Solana primitives rather than being a generic key-value store. Its schema has first-class types for Programs (program ID, cluster, IDL hash, source commit), Accounts (PDA seeds, ATA mints, owners), Instructions (account schemas, args, last invocation), Decisions (architectural choices with rationale), Findings (audit items with severity and status), and Integrations (external programs and their pinned versions). Any MCP-compatible agent can read from and write to this layer; project state survives across sessions and lives in a local SQLite file with no cloud dependency.
>
> The reference TypeScript implementation is MIT-licensed and already at v0.2.0: a working MCP server with a SQLite backend (`better-sqlite3`), BM25 ranking via SQLite FTS5, append-only versioning so bad agent writes never destroy good ones, and full schema validation against six published JSON Schemas. Repo: https://github.com/yksanjo/gmem.
>
> The $200 USDG funds the AI coding subscription (Claude Pro/Max) for the 6-week sprint that takes gmem from v0.2 to a stable, npm-published v1.0 — through Anchor workspace auto-ingest (v0.3), Solana CLI context capture (v0.4), git-linked memory diffs (v0.5), and three worked examples (DeFi / NFT / agent) plus a PR into `solana-foundation/awesome-solana-ai` at v1.0.

**Deadline**

> 2026-06-30 (Asia/Calcutta)

**Proof of Work**

> Shipped Solana / AI-agent work (all authored by me, github.com/yksanjo):
>
> - **gmem** — https://github.com/yksanjo/gmem · MIT · v0.2.0 tagged 2026-05-16
>   - v0.1.0: open spec (SPEC.md), 6 JSON Schemas (draft 2020-12), MCP server stub
>   - v0.2.0: SQLite backend, BM25 ranking via FTS5, append-only versioning, project-isolated db files
>   - Both versions have passing end-to-end wire tests (`npm run test:v02` + `npm run test:wire`)
> - **Jupiter AI Trading Agent** — Colosseum Frontier hackathon submission (team `yksanjo@yksanjo`). Autonomous Python agent integrating Jupiter Developer Platform APIs for token discovery, price monitoring, swap quotes, and lending rate analysis. State persistence, automated API diagnostics, generates DX feedback. Demonstrates the "AI agents as first-class users of Solana DeFi infrastructure" thesis that motivates gmem.
> - **PR open at solana-foundation/awesome-solana-ai** — https://github.com/solana-foundation/awesome-solana-ai/pull/168 — adding gmem to Developer Tools
> - **mirror-deployer** — https://github.com/yksanjo/mirror-deployer · pump.fun deployer reputation feed, shipped 2026-05-13
> - **Holder Hunt + $SOAG ecosystem** — daily on-chain puzzle game on Solana with Streamflow-lockup soulbound badges (Bronze/Silver/Gold), token live at `ADueXXXX…DATpump`. The game's daily cron pipeline (drop/reveal/payout) shells to a sol-agent-wallet for SPL token airdrops.
> - **gstack-saas** — https://github.com/yksanjo/gstack-saas · skill packs for B2B SaaS founder workflows (`/ceo-saas-review`, `/growth-review`, `/pricing-audit`, `/design-saas`, `/saas-retro`, `/churn-review`). Predecessor work to gmem's "agentic engineering" framing.
> - **AI session transcript** attached: see `claude-session.jsonl` and `codex-session.jsonl` in the same Drive folder. The Claude transcript captures the live build of gmem v0.2 (spec design → JSON Schemas → SQLite schema → BM25 ranking implementation → benchmark test → commit + tag + push) in this same session.

**Personal X Profile**

> x.com/yksanjo

**Personal GitHub Profile**

> github.com/yksanjo

**Colosseum Crowdedness Score**

> [PASTE_DRIVE_LINK_TO_SCREENSHOT_HERE]
>
> (Applicant has an existing Colosseum project — "Jupiter AI Trading Agent" from Frontier hackathon — and will run the Crowdedness Score via Colosseum Copilot on the gmem project space before submission.)

**AI Session Transcript**

> Attached: `claude-session.jsonl` (2.2 MB, Claude Code) + `codex-session.jsonl` (1.7 MB, Codex). The Claude transcript shows live agentic engineering on gmem v0.2 — schema design, SQLite migration, BM25 implementation, benchmark testing, commit + tag + push to GitHub.

---

## Step 3: Milestones

**Goals and Milestones**

> 1. **v0.3 — Anchor workspace auto-ingest** by 2026-05-30. Parses `Anchor.toml`, computes IDL SHA-256, captures the source commit from `target/deploy` artifacts, and writes a `Program` entity automatically when the developer runs `anchor build`. Tested against the official Anchor example workspaces.
> 2. **v0.4 — Solana CLI context capture** by 2026-06-06. Auto-detects the active keypair and cluster from `solana config get`, and signs every `Decision` write with the developer's pubkey so memory entries carry verifiable provenance.
> 3. **v0.5 — Git linkage + JSONL memory log** by 2026-06-13. `gmem.diff(commit_a, commit_b)` resolves git refs to timestamps and returns added/changed entities. JSONL memory log alongside the SQLite snapshot for clean git diffs on shared team memory.
> 4. **v1.0 — Stable release + 3 worked examples + Foundation PR** by 2026-06-30. Tagged v1.0.0 on npm, three end-to-end examples (DeFi vault, cNFT mint, AI-agent program), and the previously-opened PR into `solana-foundation/awesome-solana-ai` (#168) merged.

**Primary KPI**

> gmem v1.0 published to npm with ≥ 50 GitHub stars and PR #168 merged into `solana-foundation/awesome-solana-ai` by 2026-06-30. Diagnostic side-metrics: ≥ 100 weekly npm downloads in the first month, ≥ 3 external contributors (PRs merged from non-author accounts).

**Final tranche checkbox**

> Acknowledged: to receive the final 100 USDG tranche, I will submit the live project URL (https://github.com/yksanjo/gmem), the GitHub repo, and the Claude Pro/Max subscription receipts totaling $200 via the second tranche form.

---

## What to attach to the form

| File | Where it is | How to upload |
|------|-------------|---------------|
| Application text (above) | `~/gmem/GRANT-APPLICATION.md` | Copy each blockquote into the matching form field |
| `claude-session.jsonl` | `~/gmem/claude-session.jsonl` (2.2 MB) | Upload to a public Drive folder, paste link in "AI Session Transcript" |
| `codex-session.jsonl` | `~/gmem/codex-session.jsonl` (1.7 MB) | Upload to the same Drive folder |
| Colosseum Crowdedness Score screenshot | (skipped) | (skipped per applicant) |

## ⚠️ Important — review the transcript before uploading

The `claude-session.jsonl` is a full copy of this conversation, which means it contains:

- The Synapse RPC API key you pasted earlier (`sk_live_66c9e351…`) — should be rotated regardless
- The Superteam Earn agent API key for gmem (`sk_de9045ea…`)
- Two demo Solana keypairs that were generated and immediately deleted (still in the text)
- Your email address (yoshi@soundraw.co.jp)
- Internal strategy notes (Path 1/2/3 earning plan, runbook)

For a grant reviewer at Superteam, none of that is malicious — they're a partner platform, the API keys are limited-scope (rate-limited RPC and rate-limited Superteam agent), and the demo keypairs are unfunded. But before uploading:

1. **Rotate the Synapse RPC key** in the dashboard (low urgency, but the key is in plaintext in the transcript)
2. **Consider redacting** the strategy notes if you'd rather not share your earning roadmap with a reviewer

If you want, I can write a redacted version of the transcript that strips API keys and the strategy doc while keeping the gmem-related work intact. Say the word.

## Submission steps

1. Optionally: I produce a redacted transcript (`claude-session.redacted.jsonl`) — say "redact"
2. Upload `claude-session.jsonl` (or `claude-session.redacted.jsonl`) + `codex-session.jsonl` to a new public Google Drive folder
3. Open https://superteam.fun/earn/grants/agentic-engineering
4. Click Apply, paste each blockquote above into the matching form field, paste the Drive link into the "AI Session Transcript" field
5. Submit

Approval timeline: ~1 week. First tranche ($100 USDG) lands the Friday after KYC clears.
