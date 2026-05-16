# Example 2 — cNFT mint project memory

Worked example: how an agent uses gmem while building a Solana **compressed-NFT
mint** powered by Metaplex Bubblegum. The product: a free-mint platform where
artists upload art and fans claim a cNFT for a $0.0001 rent fee, with the merkle
tree state and royalty enforcement managed entirely on-chain.

## The state gmem holds for this project

**Programs**
- `mint_router` (devnet `8wXq…Yv7m`, mainnet `MintR…vTH`) — picks which tree to mint into
- `bubblegum` (mainnet `BGUMA…rcz`, external) — recorded as `Integration`
- `account_compression` (mainnet `cmtDvX…spvk`, external) — `Integration`

**Accounts**
- `merkle_tree` keypair-account (not PDA — Bubblegum requires this)
- `tree_authority` PDA, seeds `[merkle_tree.key().as_ref()]`, owned by Bubblegum
- `collection_mint` SPL mint for the collection NFT (Token-2022 with metadata)
- `royalty_recipient_ata` ATA for the artist

**Instructions**
- `create_tree` — admin-only, picks `max_depth` and `max_buffer_size` per cost target
- `mint_to_collection` — public, fee = rent + 0.0001 SOL platform fee
- `transfer` — proxied through Bubblegum
- `redeem` — for users who want to decompress (rare, charges rent back)

**Decisions**
- "Bubblegum over Core for v1" — cNFT cost ($0.0001) crushes Core's regular mint cost ($0.012) at our scale (free-mint distribution model breaks at >$0.001/mint)
- "max_depth = 20, max_buffer = 256" — supports 1M mints per tree, costs ~$300 in rent. Smaller trees mean tree churn and broken collection grouping; bigger trees mean wasted rent we can't reclaim
- "No royalty enforcement on-chain" — cNFT royalties are creator-honored at marketplace level; on-chain enforcement requires SPL Hooks (Token-2022) which Bubblegum doesn't proxy for in v1
- "Token-2022 for the collection NFT, not the leaves" — collection NFT carries metadata + royalty fields via Token-2022 extensions; leaves stay SPL Token (cheaper)

**Findings**
- `[MEDIUM]` `create_tree` doesn't sanity-check `max_depth` against `max_buffer_size` — pairings outside Bubblegum's allowlist will silently waste rent (open)
- `[LOW]` `redeem` has no per-user rate limit — griefer could empty their wallet via repeated decompress to drain rent (accepted-risk, low cost)
- `[INFO]` Helius RPC's `getAssetsByOwner` is the only practical way to enumerate a user's cNFTs (no on-chain index)

**Integrations**
- Bubblegum (`BGUMA…rcz`) pinned at v0.8
- Account Compression (`cmtDvX…spvk`) pinned at v0.4
- Helius DAS API for asset enumeration (no on-chain alternative)

## Why an agent needs gmem for this project

cNFT projects are pattern-heavy and the patterns are *invisible*: Bubblegum's
canopy depth + buffer size pairings, Token-2022 extension compatibility with
Bubblegum proxying, Helius vs Anza RPC method differences. Without gmem, a new
agent session re-learns these via 3-4 round-trips per question. With gmem, a
single `gmem.recall("bubblegum tree sizing")` returns:

- The Decision: max_depth=20, max_buffer=256, rationale links the cost target
- The Finding: `create_tree` doesn't validate the pairing — DON'T pick exotic values
- The Integration version pin: Bubblegum v0.8 (so the agent doesn't fetch v0.9 docs)

That's three round-trips collapsed into one.
