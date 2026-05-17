import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, "..", "schema");

function load(name: string): object {
  return JSON.parse(readFileSync(resolve(schemaDir, `${name}.json`), "utf8"));
}

export const Kinds = [
  "Program",      // Solana program (v0.1+)
  "Account",      // Solana PDA / ATA / keypair / external account (v0.1+)
  "Instruction",  // Solana program instruction (v0.1+)
  "Decision",     // architectural choice (v0.1+, author auto-attributed in v0.4+)
  "Finding",      // audit/review finding (v0.1+)
  "Integration",  // external on-chain dependency (v0.1+)
  "Contract",     // EVM smart contract — Ethereum/Base/Optimism/Polygon/Arbitrum (v1.1+)
] as const;
export type Kind = (typeof Kinds)[number];

export const schemas: Record<Kind, object> = {
  Program: load("program"),
  Account: load("account"),
  Instruction: load("instruction"),
  Decision: load("decision"),
  Finding: load("finding"),
  Integration: load("integration"),
  Contract: load("contract"),
};
