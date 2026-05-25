/**
 * Agent trust scorer — v1 heuristic.
 *
 * Deterministic, transparent, no LLM cost. Picks signals that are hard to
 * fake cheaply on-chain (age, distinct counterparty graph) and discounts
 * the two things that should kill trust outright (transaction failure
 * ratio + proximity to sanctioned wallets).
 *
 * Why heuristic-first instead of LLM-judge:
 *   1. Buyers will demand to see the formula before they'll wire it into
 *      a payment guardrail. A black-box score loses the design-partner pitch.
 *   2. Free at inference time — runs offline, no Claude/OpenAI quota.
 *   3. Reproducible. The same inputs always produce the same score, which
 *      makes regressions obvious and CI-friendly.
 *
 * v2 ("v2-llm-judge") layers an LLM read over transaction narratives and
 * counterparty intent — see roadmap for v1.3.
 */
import type { IngestedAgent } from "../ingest/helius.js";

export interface ScoreBreakdown {
  base: number;
  txVolume: number;       // log(txCount), capped +15
  peerDiversity: number;  // log(peerCount), capped +10
  age: number;            // months since firstSeen, capped +10
  failurePenalty: number; // -failureRatio * 30
  sanctionsPenalty: number; // -sanctionedNeighborCount * 25
  total: number;          // clamped to [0, 100]
}

export interface ScoreResult {
  score: number;
  scoreVersion: "v1-heuristic";
  scoreReasoning: string;
  scoredAt: string;
  breakdown: ScoreBreakdown;
}

const BASE = 50;
const MAX_TX_BOOST = 15;
const MAX_PEER_BOOST = 10;
const MAX_AGE_BOOST = 10;
const FAILURE_WEIGHT = 30;
const SANCTIONS_WEIGHT = 25;

export function scoreAgent(agent: IngestedAgent, now: Date = new Date()): ScoreResult {
  const txVolume = Math.min(Math.log10(1 + agent.txCount) * 7.5, MAX_TX_BOOST);
  const peerDiversity = Math.min(Math.log10(1 + agent.peerCount) * 5, MAX_PEER_BOOST);

  let age = 0;
  if (agent.firstSeen) {
    const ageMs = now.getTime() - new Date(agent.firstSeen).getTime();
    const months = ageMs / (1000 * 60 * 60 * 24 * 30);
    age = Math.min(Math.max(months, 0), MAX_AGE_BOOST);
  }

  const failurePenalty = -agent.failureRatio * FAILURE_WEIGHT;
  const sanctionsPenalty = -agent.sanctionedNeighborCount * SANCTIONS_WEIGHT;

  const raw = BASE + txVolume + peerDiversity + age + failurePenalty + sanctionsPenalty;
  const total = clamp(raw, 0, 100);

  const breakdown: ScoreBreakdown = {
    base: BASE,
    txVolume: round1(txVolume),
    peerDiversity: round1(peerDiversity),
    age: round1(age),
    failurePenalty: round1(failurePenalty),
    sanctionsPenalty: round1(sanctionsPenalty),
    total: round1(total),
  };

  return {
    score: round1(total),
    scoreVersion: "v1-heuristic",
    scoreReasoning: explain(breakdown, agent),
    scoredAt: now.toISOString(),
    breakdown,
  };
}

function explain(b: ScoreBreakdown, a: IngestedAgent): string {
  const parts: string[] = [`base ${b.base}`];
  if (b.txVolume) parts.push(`+${b.txVolume} from ${a.txCount} txs`);
  if (b.peerDiversity) parts.push(`+${b.peerDiversity} from ${a.peerCount} distinct peers`);
  if (b.age) parts.push(`+${b.age} from age`);
  if (b.failurePenalty) parts.push(`${b.failurePenalty} from ${(a.failureRatio * 100).toFixed(1)}% failure rate`);
  if (b.sanctionsPenalty) parts.push(`${b.sanctionsPenalty} from ${a.sanctionedNeighborCount} sanctioned neighbor(s)`);
  parts.push(`= ${b.total}`);
  return parts.join(", ");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
