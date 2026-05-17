# gmem outreach drafts — 5 Solana orgs whose Claude Code skills already ship

Each org below has an entry in `solana-foundation/awesome-solana-ai`'s "AI Coding Skills" section. They're the natural distribution partners for gmem: their skill tells an agent *how* to do X, gmem tells the agent *what's been done* on the project. Complementary, not competitive.

**Strategy:** lightweight, no-ask DM. Lead with the value to *them*, not the ask for you. Goal at this stage isn't a partnership — it's:

- An on-record acknowledgement ("cool, will check it out")
- An RT or featured-in-newsletter mention
- A name they recognize when the awesome-solana-ai PR lands their inbox

You send these from `@yksanjo` on X (DM if you can, public reply with @ tag if you can't). All are deliberately under 280 chars so they fit a single DM screen.

---

## 1. Helius (@heliuslabs)

**Why this org first:** Powers Phantom, Jupiter, DFlow, Coinbase. If Helius's docs link to gmem as the recommended memory layer for agents using their RPC, that's the highest-leverage placement in the ecosystem.

```
hi Mehul — built gmem this weekend, an MCP memory server giving agents
typed memory of Solana programs/PDAs/decisions/audit findings across
sessions (and EVM Contracts in v1.1).

it pairs cleanly with helius-skill: skill teaches the agent how, gmem
remembers what's been done. open-source, MIT.

github.com/yksanjo/gmem
```

> Mehul Chadda is one of Helius's most-active dev-rel voices on X (`@mehulc__`).
> Alternate: founder Mert Mumtaz `@mertmumtaz` — higher follower count, less
> likely to reply. Start with Mehul.

---

## 2. Phantom (@phantom)

**Why:** Their Phantom Connect SDK lives in the same awesome-solana-ai cluster. Phantom dev rel has been pushing the "Solana wallet for agents" narrative all of 2026.

```
hi — Yoshi, built gmem (MIT, MCP server for persistent Solana project
memory). when agents using phantom-connect re-open a project they
currently forget every wallet/account they linked yesterday. gmem
solves that with typed Account/Decision entries.

github.com/yksanjo/gmem — would love phantom-connect doc-link if a fit.
```

> Brandon Millman `@brandonmillman` is CEO + active on X. Worth a follow + reply
> rather than cold DM as first touch. Public reply on a relevant tweet > cold DM.

---

## 3. MagicBlock (@magicblock)

**Why:** Their ephemeral rollups are the use case that NEEDS gmem most — agents working on real-time on-chain programs across delegate/undelegate cycles, with multiple PDA seeds per session. They've already shipped magicblock-dev-skill for Claude Code.

```
hi — built gmem (MIT, MCP server). gives Claude Code persistent typed
memory of Solana programs/PDAs/decisions across sessions. designed for
exactly the workflow magicblock-dev-skill enables: agents iterating on
delegate/undelegate cycles forget the session keys + ER state today.

github.com/yksanjo/gmem
```

> Tomasz Skowroński `@tom_magicblock` or Andrew Hyde `@andrewmhyde`. Both
> active. Try Andrew first — handles partnerships.

---

## 4. Anza (@anza_xyz)

**Why:** Core Solana protocol team. If Anza or a maintainer of solana-dev-skill (their official Claude Code skill) blesses gmem, that's effectively a Solana Foundation co-sign without going through the grants HubSpot form.

```
hi — small open-source addition to the awesome-solana-ai stack: gmem,
an MCP memory server (MIT) that gives Claude Code typed memory of
programs, PDAs, decisions, and audit findings across sessions.

complements solana-dev-skill cleanly. PR open at solana-foundation/
awesome-solana-ai#168. github.com/yksanjo/gmem
```

> Maintainer of `solana-dev-skill` is the right target. Check the repo's
> README for the current owner. As of last check it was someone at Anza.

---

## 5. Jupiter (@JupiterExchange)

**Why:** Their Claude Code skill (`jupiter-skill`) covers Ultra swaps, limit orders, DCA, perpetuals — that's a LOT of state per project. Memory is the missing piece. Plus Yoshi's existing Colosseum Frontier submission is literally "Jupiter AI Trading Agent" — there's a real prior thread.

```
hi — Yoshi (built Jupiter AI Trading Agent for Colosseum Frontier). just
shipped gmem (MIT, MCP server) — gives agents persistent typed memory
across sessions, including Decisions about route choices and Findings
about route-hash mismatches.

pairs naturally with jupiter-skill. github.com/yksanjo/gmem
```

> Meow `@weremeow` is founder + most active. Or the Catdet team handle.
> The Jupiter Frontier connection is a real warm-intro lever — use it.

---

## Sequencing

Send in this order, 1-2 per day so it doesn't look like a coordinated push:

1. **Day 1 (today):** Helius (cold DM Mehul)
2. **Day 1 evening:** Phantom (public reply on a relevant tweet, not DM)
3. **Day 2:** MagicBlock (DM Andrew Hyde, mention shipped repo)
4. **Day 3:** Anza / solana-dev-skill maintainer (GitHub issue might work better than X DM here — opens a thread on neutral ground)
5. **Day 4:** Jupiter (reply on Meow's most recent dev-tooling tweet, mention Frontier prior)

If any of them reply positively, the "ask" escalates naturally to "want to docs-link gmem?" or "want to RT?" — don't lead with that.

## What none of these should say

- ❌ "I'm applying for a grant" — desperate
- ❌ "Looking for partnership" — vague
- ❌ "Would love your support" — passive
- ❌ Links to the Foundation grant application — keep separate
- ❌ The mcpName / npm package version — too engineering, save for if they ask

## What to track

Make a simple sheet (Notes app fine):

| Org | Date sent | Channel | Response | Follow-up date |
|-----|-----------|---------|----------|---------------|
| Helius |  | DM Mehul |  |  |
| Phantom |  | Reply Brandon |  |  |
| MagicBlock |  | DM Andrew |  |  |
| Anza |  | GitHub issue |  |  |
| Jupiter |  | Reply Meow |  |  |

Reasonable bar: 1 of 5 replies positively. That's enough to be worth the 5 minutes of sending.

## What I CAN'T do for you

- Send any of these from `@yksanjo` (your X)
- Reply on tweets from Yoshi's X account
- Find the current maintainer of `solana-dev-skill` if it changed hands
- Track responses (your inbox / DMs)

Drafts are below in copy-paste form. Send when awake.
