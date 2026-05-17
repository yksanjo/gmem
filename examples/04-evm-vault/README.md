# Example 4 — EVM vault project memory (Base / Optimism / Polygon)

Worked example for **gmem v1.1+**: the same persistent-memory pattern from the
Solana examples applied to an EVM project. The product: a delta-neutral yield
vault deployed across **Base**, **Optimism**, and **Polygon**, with the same
core logic on each chain.

This example exists because — as of v1.1 — gmem speaks both Solana and EVM.
The entity model holds across chains while preserving the chain-specific
detail each ecosystem requires.

## The state gmem holds for this project

**Contracts** (the EVM analogue of `Program`)

| Chain               | Name      | Address                                      | Notes                       |
| ------------------- | --------- | -------------------------------------------- | --------------------------- |
| `base-mainnet`      | `Vault`   | `0x1234567890123456789012345678901234567890` | USDC delta-neutral, primary |
| `base-mainnet`      | `Router`  | `0xaaaa…aaaa`                                | Routes deposits to Vault    |
| `optimism-mainnet`  | `Vault`   | `0xbbbb…bbbb`                                | Mirror of Base Vault        |
| `polygon-mainnet`   | `Vault`   | `0xcccc…cccc`                                | Same hedge logic, different oracle stack |

Each row carries: 0x-prefixed address (checksum-case preserved), canonical
chain slug, numeric chainId, ABI sha256 (canonicalized — order-invariant),
git commit the bytecode was built from, deployment tx hash.

**Decisions** (chain-agnostic, auto-attributed to deployer wallet via gmem v0.4 cousin)

- "Hardhat over Foundry" — `hardhat-deploy` artifact convention is well-defined,
  and our CI/CD already uses it; Foundry's `broadcast/` format works but
  gmem can be wired to either via additional ingest tools later
- "Same contract address NOT used across chains" — CREATE2 vanity addresses
  considered then rejected; the cost of cross-chain coordination during
  deploys outweighed the marketing benefit
- "Pyth on Base, Chainlink on Optimism" — Pyth has the deepest Base coverage,
  but Optimism's Chainlink feeds are more battle-tested; pin to per-chain best

**Findings**

- `[HIGH]` Base Vault and Optimism Vault use different oracle providers, so a
  multi-chain rebalance run could quote on one feed and execute on another;
  rebalancer must read all chains then act per-chain (fixed in v1.1.0)
- `[MEDIUM]` polygon-mainnet deployment used a different solc minor version
  than base; bytecode hash should diverge intentionally — flag, don't auto-fix

**Integrations** (cross-chain, also gmem-tracked)

- Aave v3 — `0x87870Bca…` on base, `0x794a61358D…` on Optimism, `0x794a61358D…` on Polygon
- Pyth Hermes — `0x4305FB66…` on base
- Chainlink ETH/USD feed — `0xb7B9A39CC…` on Optimism

## How an agent uses gmem here

When a new agent session opens this multi-chain project, it asks:

```
gmem.recall("vault address base")
→ Contract(base-mainnet, 0x1234…, name=Vault)

gmem.recall("oracle differences between chains")
→ Decision("Pyth on Base, Chainlink on Optimism") + Finding(HIGH, oracle mismatch)

gmem.diff(HEAD~5, HEAD)
→ added: optimism-mainnet Vault, polygon-mainnet Vault
   changed: base-mainnet Vault (v2 — switched to Pyth)
```

A new agent picks up the multi-chain context in one round-trip per question.

## Auto-ingest from Hardhat

The project uses `hardhat-deploy`. After running:

```bash
npx hardhat deploy --network base
npx hardhat deploy --network optimism
npx hardhat deploy --network polygon
```

…the agent runs `gmem.ingest_hardhat` once and gmem records every Contract
across every network, with ABI hashes and git source commits captured
automatically.

See `examples/01-defi-vault/README.md` for the Solana equivalent of this
same architectural pattern.
