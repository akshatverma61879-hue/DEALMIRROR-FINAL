/**
 * Deterministic checks on what the SALESPERSON says in practice (runs in the browser and on the server).
 * These are private coaching flags; they are never shown to or sent to the fictional buyer.
 */
import type { PrivateRules, ProductFacts } from "../types";
import { formatProductFacts } from "../ai/prompt-safety";

const DISCOUNT_WORDS = /discount|\boff\b|rebate|waive|free (?:month|year)|छूट|डिस्काउंट|chhoot|kam kar(?:enge|denge|dunga|ungi)?|kam kar sakte/i;
const FIGURE = /(?:₹|rs\.?\s?|inr\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lac|crore|cr|k))?|\d[\d,]*(?:\.\d+)?\s?(?:%|lakh|lac|crore|cr|x\b)/gi;

const pct = (s: string) => {
  const m = s.match(/(\d+(?:\.\d+)?)\s?%/);
  return m ? parseFloat(m[1]) : null;
};
const normFig = (f: string) =>
  f.toLowerCase().replace(/^(?:rs\.?|inr|₹)/, "").replace(/,|\s/g, "").replace(/lac$/, "lakh");
const figs = (t: string) => new Set((t.match(FIGURE) ?? []).map(normFig));

/** "24/7 support; custom integrations" → ["24/7 support", "custom integrations"] */
export function neverPromiseItems(rules: PrivateRules) {
  return rules.neverPromise
    .split(/[;\n,]|\band\b/i)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length >= 3);
}

export interface ComplianceResult {
  violations: string[]; // break a private rule → RULE_COMPLIANCE capped
  unsupportedFigures: string[]; // → PRODUCT_ACCURACY capped
}

export function checkSellerMessage(
  text: string,
  ctx: { privateRules: PrivateRules; productFacts: ProductFacts; transcript: string },
): ComplianceResult {
  const violations: string[] = [];
  const t = text.toLowerCase();

  const max = pct(ctx.privateRules.maxDiscount);
  if (DISCOUNT_WORDS.test(text)) {
    const offered = [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => parseFloat(m[1]));
    const over = offered.filter((p) => max !== null && p > max);
    if (over.length) violations.push(`Offered ${Math.max(...over)}% — above your ${max}% maximum discount.`);
  }

  const walk = figs(ctx.privateRules.walkAwayPrice);
  const said = figs(text);
  if ([...said].some((f) => walk.has(f))) violations.push("Revealed the walk-away price to the buyer.");

  for (const item of neverPromiseItems(ctx.privateRules)) {
    const words = item.toLowerCase().split(/\s+/).filter((w) => w.length > 2 || /\d/.test(w));
    if (words.length && words.every((w) => t.includes(w))) violations.push(`Promised “${item}”, which is on your never-promise list.`);
  }

  const allowed = figs(ctx.transcript + " " + formatProductFacts(ctx.productFacts));
  // Discount percentages are judged by the discount rule, not as "unsupported figures".
  const unsupportedFigures = [...new Set((text.match(FIGURE) ?? []).filter((f) => !allowed.has(normFig(f)) && !(DISCOUNT_WORDS.test(text) && /%/.test(f))))];

  return { violations, unsupportedFigures };
}

export function flagsFor(result: ComplianceResult) {
  return [
    ...result.violations,
    ...result.unsupportedFigures.map((f) => `“${f}” is not in your product facts or the call. Check it is accurate.`),
  ];
}
