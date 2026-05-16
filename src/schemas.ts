import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, "..", "schema");

function load(name: string): object {
  return JSON.parse(readFileSync(resolve(schemaDir, `${name}.json`), "utf8"));
}

export const Kinds = ["Program", "Account", "Instruction", "Decision", "Finding", "Integration"] as const;
export type Kind = (typeof Kinds)[number];

export const schemas: Record<Kind, object> = {
  Program: load("program"),
  Account: load("account"),
  Instruction: load("instruction"),
  Decision: load("decision"),
  Finding: load("finding"),
  Integration: load("integration"),
};
