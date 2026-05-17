# gmem — Open Spec v0.1

> Status: Draft, comments welcome via GitHub issues.
> Spec versioning: semver, this document is v0.1.

This is the wire-level specification for **gmem**, a Model Context Protocol server
exposing persistent, Solana-aware project memory to AI coding agents. The intent is
that this spec stands independent of the reference implementation in this repo — any
MCP server that conforms to the schemas and tool signatures below is a conforming
gmem implementation.

## 1. Scope

gmem stores memory **per Solana project**. A "project" is resolved from one of:

1. The nearest `Anchor.toml` walking up from `cwd`
2. The nearest `Cargo.toml` with a `[workspace]` section
3. An explicit `--project <path>` flag on the server invocation

Memory keyed under one project is isolated from another project's memory. gmem v1 does
not support cross-project queries.

## 2. Storage

The reference implementation uses SQLite by default. A Postgres backend is supported
for team setups. Storage is local — there is no hosted dependency, no cloud sync, no
remote authentication. The memory file (`memory.db` by default) is the source of truth
and can be checked into a repo if a team wants to share memory.

## 3. Entity model

gmem stores six first-class entity types. The JSON schemas live in [`schema/`](./schema/).

### 3.1 Program

A deployed Solana program tied to a cluster.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `id` | string (base58) | yes | The program ID on the cluster |
| `cluster` | enum: `mainnet-beta` \| `devnet` \| `testnet` \| `localnet` | yes | |
| `name` | string | yes | Human label, e.g. "swap" |
| `idlHash` | string (sha256 hex) | no | Pinned IDL hash for the deployed version |
| `sourceCommit` | string (git sha) | no | Source commit the deploy was built from |
| `deployedAt` | string (ISO 8601) | no | |
| `notes` | string | no | Free-text |

### 3.2 Account

A PDA, ATA, or otherwise-meaningful account.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `address` | string (base58) | yes | |
| `kind` | enum: `pda` \| `ata` \| `keypair` \| `external` | yes | |
| `seeds` | array | no | For PDAs: ordered seed descriptors (e.g. `[{ "literal": "vault" }, { "ref": "user.key()" }, { "type": "u64", "ref": "index" }]`) |
| `program` | string (base58) | no | Owning program if not the system program |
| `mint` | string (base58) | no | For ATAs: the SPL token mint |
| `notes` | string | no | |

### 3.3 Instruction

A documented instruction on one of the project's programs.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `program` | string (base58) | yes | |
| `name` | string | yes | e.g. `initialize_vault` |
| `accountsSchema` | array | no | Ordered list of `{ name, isSigner, isMut, kind }` |
| `argsSchema` | array | no | Ordered list of `{ name, type }` |
| `lastInvocation` | object | no | `{ slot, signature, signer }` |
| `notes` | string | no | |

### 3.4 Decision

An architectural choice with rationale.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `id` | string (uuid) | yes | Generated server-side if omitted on write |
| `title` | string | yes | e.g. "Anchor over native Rust" |
| `decision` | string | yes | One-sentence summary of the choice |
| `alternatives` | array of string | no | Considered alternatives |
| `rationale` | string | yes | Why this choice |
| `date` | string (ISO 8601) | yes | |
| `relatedTo` | array of `{ kind, id }` | no | Links to other entities |

### 3.5 Finding

An audit/review finding.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `id` | string (uuid) | yes | |
| `severity` | enum: `info` \| `low` \| `medium` \| `high` \| `critical` | yes | |
| `title` | string | yes | |
| `summary` | string | yes | |
| `status` | enum: `open` \| `accepted-risk` \| `fixed` \| `wontfix` | yes | |
| `discoveredAt` | string (ISO 8601) | yes | |
| `relatedTo` | array of `{ kind, id }` | no | |

### 3.6a Contract (v1.1+)

An EVM smart contract deployed on Ethereum or any EVM-compatible L2 / sidechain.
The EVM analogue of §3.1 Program. Introduced in v1.1; older clients that don't
expose the `Contract` kind via `kinds` filter will not receive it.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `address` | string (`0x` + 40 hex) | yes | Checksum-case preserved verbatim |
| `chain` | string | yes | Canonical chain slug — `ethereum-mainnet`, `base-mainnet`, `optimism-mainnet`, `polygon-mainnet`, `arbitrum-one`, plus testnets and custom values |
| `chainId` | integer | no | Numeric EVM chain ID (1, 8453, 10, 137, 42161, …) |
| `name` | string | yes | Human label (e.g. "Vault") |
| `abiHash` | string (sha256 hex) | no | Canonicalized ABI hash, **invariant to top-level entry reordering** |
| `sourceCommit` | string (git sha) | no | git sha bytecode was built from |
| `deployedAt` | string (ISO 8601) | no | |
| `txHash` | string (`0x` + 64 hex) | no | Deployment transaction hash |
| `notes` | string | no | |

### 3.6 Integration

A dependency on an external Solana program.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `name` | string | yes | e.g. "Jupiter" |
| `programId` | string (base58) | yes | |
| `versionPinned` | string | no | SDK/program version pinned by this project |
| `purpose` | string | yes | Why this project integrates |
| `addedAt` | string (ISO 8601) | yes | |

## 4. MCP tools (wire-level)

All tools live under the `gmem.*` namespace. All inputs and outputs are JSON. All
tools are idempotent on the read side and CRDT-style append on the write side
(no destructive overwrites — see §6).

### 4.1 `gmem.recall`

```jsonc
// input
{
  "query": "what PDA seeds does the vault account use",
  "kinds": ["Account", "Decision"],   // optional filter
  "limit": 10                          // default 10
}

// output
{
  "results": [
    {
      "kind": "Account",
      "entity": { /* see §3 */ },
      "score": 0.87,
      "matchedFields": ["seeds", "notes"]
    }
  ]
}
```

Ranking is implementation-defined; the reference implementation uses BM25 over
serialized entity fields plus a recency boost.

### 4.2 `gmem.write`

```jsonc
// input
{ "kind": "Decision", "entity": { /* see §3 */ } }

// output
{ "ok": true, "id": "uuid-or-natural-key", "version": 3 }
```

Versioning is monotonically increasing per `(kind, id)`. Writes never destroy prior
versions — see §6 for history retrieval.

### 4.3 `gmem.diff`

```jsonc
// input
{ "from": "abc1234", "to": "HEAD" }    // git commit refs

// output
{
  "added":    [ /* entities present at `to` but not `from` */ ],
  "removed":  [ /* entities present at `from` but not `to` */ ],
  "changed":  [ { "before": {...}, "after": {...} } ]
}
```

Requires the project to be a git repo and gmem to have observed both commits.

### 4.4 `gmem.list_decisions`

```jsonc
// input
{ "limit": 50 }    // default 50, sorted by date desc

// output
{ "decisions": [ /* Decision entities, see §3.4 */ ] }
```

## 5. Conformance

A conforming implementation MUST:

- Expose the four tools in §4 with the documented input/output shapes
- Validate `entity` payloads against the JSON schemas in [`schema/`](./schema/) and
  reject writes that do not conform
- Isolate memory per project (§1)

A conforming implementation MAY:

- Add additional tools under the `gmem.*` namespace (e.g. `gmem.export`,
  `gmem.import`, `gmem.gc`) — these are non-normative
- Add additional entity kinds — but they MUST NOT be returned to clients that did
  not request them by `kinds` filter

## 6. History and immutability

Every successful `gmem.write` appends a new version. Reads return the latest version
by default. A future `gmem.history(kind, id)` tool will expose prior versions; it is
non-normative for v0.1 but reserved.

This append-only model is deliberate: agents make mistakes, and a memory layer that
can be overwritten by a bad agent write is worse than no memory at all. Compaction is
explicit and human-initiated.

## 7. Open questions (v0.1 cycle)

These are explicitly unresolved in v0.1. Feedback welcome via GitHub issues tagged
`spec`.

1. **Embeddings**: Should the spec mandate vector embeddings for `recall`, or leave
   ranking strategy implementation-defined? Current draft: implementation-defined.
2. **Multi-cluster projects**: A project may deploy to devnet and mainnet from the
   same source. Does each (program, cluster) pair get its own entity, or one
   `Program` with a `clusters[]` field? Current draft: each pair is a separate entity.
3. **Team sync**: When `memory.db` is checked into git, merge conflicts on
   append-only history are tractable but non-trivial. Should the spec recommend a
   specific format (e.g. JSONL "memory log" alongside the SQLite snapshot) for
   git-friendliness? Current draft: silent on this — JSONL log proposed for v0.2.
4. **Schema evolution**: How are migrations between schema versions handled?
   Current draft: minor schema versions are additive; major schema versions ship
   a migration tool. Codified in v0.2.

## 8. Out of scope

The following are deliberately not in scope for gmem v1.0:

- Hosted multi-user sync
- Cross-project search
- Agent reputation / authentication
- On-chain memory anchoring
- AI-driven summarization of memory entries

These may be addressed in later major versions.

## 9. Versioning

This spec uses semver. v0.x is a draft sequence — breaking changes are allowed.
v1.0 freezes the four core tools and six entity types above. Additional kinds and
non-normative tools can be added in v1.x without breaking compliance.
