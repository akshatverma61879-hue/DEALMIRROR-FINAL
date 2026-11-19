import type { Analysis, CriterionResult, ScoreCard, ScoreId, ScoreSet } from "./types";
import {
  BANDS,
  CAPS,
  CRITERIA,
  MIN_COVERAGE,
  MIN_TURNS_FOR_ABSENCE,
  SCORE_META,
  type CapRule,
  type Criterion,
  type RubricContext,
  type WeightedStage,
} from "./scoring-rubric";

/**
 * Deterministic scoring. The AI never sets a score: it reports findings with quotes, the code
 * verifies the quotes, and this file turns verified evidence into three 0–100 scores.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function bandFor(id: ScoreId, score: number) {
  const s = clamp(Math.round(score));
  return BANDS[id].find((b) => s >= b.min && s <= b.max) ?? BANDS[id][0];
}

/** The stage whose weights are used. UNKNOWN uses EVALUATION, the middle of the cycle. */
export function weightsStage(stage: Analysis["salesStage"]["stage"]): WeightedStage {
  return stage === "UNKNOWN" ? "EVALUATION" : stage;
}

export interface ScoreInput {
  findings: Analysis["findings"];
  objections: Analysis["objections"];
  illusions: Analysis["illusions"];
  realityCheck: Analysis["realityCheck"];
  salesStage: Analysis["salesStage"];
  speakerTurns: number;
}

function scoreCard(id: ScoreId, ctx: RubricContext, criteria: Criterion[] = CRITERIA, caps: CapRule[] = CAPS): ScoreCard {
  const mine = criteria.filter((c) => c.score === id);
  const evaluated = mine.map((c) => {
    const weight = c.weights[ctx.stage];
    const ev = weight > 0 ? c.evaluate(ctx) : { outcome: "not_applicable" as const, note: "Not weighted at this sales stage." };
    return { c, weight, ev };
  });

  // Applicable = weighted and not "not applicable". Judged = applicable and scored.
  const applicableWeight = evaluated.filter((e) => e.weight > 0 && e.ev.outcome !== "not_applicable").reduce((s, e) => s + e.weight, 0);
  const judgedWeight = evaluated.filter((e) => e.ev.outcome === "scored").reduce((s, e) => s + e.weight, 0);
  const coverage = applicableWeight ? judgedWeight / applicableWeight : 0;

  const results: CriterionResult[] = evaluated.map(({ c, weight, ev }) => {
    const scored = ev.outcome === "scored";
    const possible = scored && judgedWeight ? (100 * weight) / judgedWeight : 0;
    return {
      id: c.id,
      label: c.label,
      weight,
      outcome: ev.outcome,
      value: scored ? ev.value : null,
      earned: scored ? round1(possible * ev.value) : 0,
      possible: round1(possible),
      evidence: scored ? ev.evidence : [],
      basedOnAbsence: scored ? !!ev.basedOnAbsence : false,
      note: ev.note,
      rationale: c.rationale,
      recommendation: c.recommendation,
      recoveryAction: c.recoveryAction,
    };
  });

  const meta = SCORE_META[id];
  const enough = judgedWeight > 0 && coverage >= MIN_COVERAGE;
  // From exact weights, not the rounded per-criterion points, so the score never drifts by rounding.
  const earnedWeight = evaluated.reduce((s, e) => s + (e.ev.outcome === "scored" ? e.weight * e.ev.value : 0), 0);
  const raw = enough ? clamp(Math.round((100 * earnedWeight) / judgedWeight)) : null;

  const capRule = caps.find((k) => k.score === id && k.trigger(ctx));
  const capQuote = capRule?.trigger(ctx) ?? null;
  const cap = capRule && capQuote ? { ruleId: capRule.id, label: capRule.label, max: capRule.max, quote: capQuote.quote, line: capQuote.line, recoveryAction: capRule.recoveryAction, recommendation: capRule.recommendation } : null;

  // An explicit cap is itself strong evidence, so it produces a score even when coverage is low.
  let score = raw;
  if (cap) score = Math.min(raw ?? cap.max, cap.max);
  const band = score === null ? null : bandFor(id, score);

  return {
    id,
    title: meta.title,
    score,
    uncapped: raw,
    status: score === null ? "INSUFFICIENT_EVIDENCE" : "SCORED",
    band: band?.label ?? "Insufficient evidence",
    bandTone: band?.tone ?? "neutral",
    coverage: Math.round(coverage * 100) / 100,
    criteria: results,
    cap,
    higherIsBetter: meta.higherIsBetter,
  };
}

export function calculateScores(input: ScoreInput, criteria: Criterion[] = CRITERIA, caps: CapRule[] = CAPS): ScoreSet {
  const stage = weightsStage(input.salesStage.stage);
  const ctx: RubricContext = {
    findings: input.findings,
    objections: input.objections,
    illusions: input.illusions,
    realityCheck: input.realityCheck,
    stage,
    longEnough: input.speakerTurns >= MIN_TURNS_FOR_ABSENCE,
  };
  return {
    stage: input.salesStage.stage,
    weightsFrom: stage,
    deal: scoreCard("deal", ctx, criteria, caps),
    seller: scoreCard("seller", ctx, criteria, caps),
    illusion: scoreCard("illusion", ctx, criteria, caps),
  };
}

/** Criteria that lost points, worst first: the improvement actions for a card. */
export function gaps(card: ScoreCard): CriterionResult[] {
  return card.criteria
    .filter((c) => c.outcome === "scored" && c.earned < c.possible)
    .sort((a, b) => b.possible - b.earned - (a.possible - a.earned));
}

/** Points a criterion would recover if fully met (higher-is-better cards). */
export const recoverable = (c: CriterionResult) => round1(c.possible - c.earned);

/**
 * Hypothetical Deal Health / Salesperson score if the selected gaps were fully closed.
 * `selected` holds criterion ids and/or the cap's ruleId (removing the cap).
 * Only scored gaps count; each counts once; the judged weight does not change; 0–100.
 * The real card is never modified.
 */
export function simulateScore(card: ScoreCard, selected: Iterable<string>): number | null {
  const ids = new Set(selected);
  if (card.uncapped === null && !card.cap) return null;
  const base = card.criteria.reduce((s, c) => {
    if (c.outcome !== "scored") return s;
    return s + (ids.has(c.id) ? c.possible : c.possible * (c.value ?? 0));
  }, 0);
  let score = clamp(Math.round(base));
  if (card.cap && !ids.has(card.cap.ruleId)) score = Math.min(score, card.cap.max);
  return score;
}
