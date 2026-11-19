/**
 * PRACTICE SCORECARD RUBRIC (transparent, weights sum to 100).
 * The AI scores each dimension 0–10 with a reason and a quote from the seller.
 * Code then applies hard caps from deterministic checks and computes the weighted overall score.
 */
import type { PracticeDimension } from "./types";

export const PRACTICE_RUBRIC: { id: PracticeDimension; label: string; weight: number; whatGoodLooksLike: string }[] = [
  { id: "UNDERSTANDING", label: "Understanding of buyer concerns", weight: 15, whatGoodLooksLike: "Asks why, restates the concern, uncovers what is behind it." },
  { id: "OBJECTION_HANDLING", label: "Objection handling", weight: 20, whatGoodLooksLike: "Addresses the actual concern instead of deflecting or listing features." },
  { id: "PRODUCT_ACCURACY", label: "Product accuracy", weight: 15, whatGoodLooksLike: "Only claims what the product facts support; no invented features or figures." },
  { id: "VALUE_COMMUNICATION", label: "Value communication", weight: 15, whatGoodLooksLike: "Links value to the buyer's own situation using verified figures." },
  { id: "PROFESSIONALISM", label: "Professional communication", weight: 10, whatGoodLooksLike: "Clear, respectful, concise; no pressure tactics." },
  { id: "RULE_COMPLIANCE", label: "Compliance with internal sales rules", weight: 15, whatGoodLooksLike: "Stays within discount limits and never makes forbidden promises." },
  { id: "FOLLOW_UP", label: "Follow-up quality", weight: 10, whatGoodLooksLike: "Proposes a specific, dated next step with the right people." },
];

/** Hard caps applied in code when deterministic checks find a problem. */
export const CAPS = {
  ruleViolation: 2, // RULE_COMPLIANCE max when a discount/never-promise rule is broken
  unsupportedFigure: 5, // PRODUCT_ACCURACY max when the seller used a figure not in facts/transcript
} as const;

export function weightedOverall(scores: { id: PracticeDimension; score: number }[]) {
  const total = PRACTICE_RUBRIC.reduce((sum, r) => {
    const s = scores.find((x) => x.id === r.id)?.score ?? 0;
    return sum + r.weight * (Math.max(0, Math.min(10, s)) / 10);
  }, 0);
  return Math.round(total);
}
