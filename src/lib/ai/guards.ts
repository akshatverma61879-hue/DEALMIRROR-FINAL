/**
 * Code-level guards on AI-suggested responses. The model is told these rules too,
 * but nothing relies on the model obeying them.
 */
import type { PrivateRules, ProductFacts, Suggestion } from "../types";
import { formatProductFacts } from "./prompt-safety";

const DISCOUNT_WORDS = /discount|off\b|rebate|waive|छूट|डिस्काउंट|chhoot|kam kar/i;
const GUARANTEE_WORDS = /\bguarantee[ds]?\b|\bguaranteed\b|100%\s*(?:sure|certain|guarantee)|गारंटी|pakka/i;
const FIGURE = /(?:₹|rs\.?\s?|inr\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lac|crore|cr|k))?|\d[\d,]*(?:\.\d+)?\s?(?:%|lakh|lac|crore|cr|x\b)/gi;

function parsePercent(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s?%/);
  return m ? parseFloat(m[1]) : null;
}

function normFigure(f: string) {
  return f
    .toLowerCase()
    .replace(/^(?:rs\.?|inr|₹)/, "")
    .replace(/,|\s/g, "")
    .replace(/lac$/, "lakh")
    .replace(/crore$/, "cr");
}

/** Exact set of figures (₹ amounts, %, lakh/crore, multipliers) found in a text. */
function figures(text: string) {
  return new Set((text.match(FIGURE) ?? []).map(normFigure));
}

export interface GuardContext {
  transcript: string;
  productFacts: ProductFacts;
  privateRules: PrivateRules;
}

export function guardSuggestion(
  text: string,
  basedOn: string[],
  clarifyingQuestion: string,
  ctx: GuardContext,
): Suggestion | null {
  const t = text.trim();
  const cq = clarifyingQuestion.trim() || null;
  if (!t && !cq) return null;

  const warnings: string[] = [];
  let withheld = false;

  // 1. Discount above the allowed limit
  const maxDiscount = parsePercent(ctx.privateRules.maxDiscount);
  if (t && DISCOUNT_WORDS.test(t)) {
    const offered = [...t.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => parseFloat(m[1]));
    if (maxDiscount === null) {
      warnings.push("Mentions a discount, but no maximum discount is set in Private Sales Rules. Check with your manager first.");
    } else if (offered.some((p) => p > maxDiscount)) {
      warnings.push(`Withheld: it offered more than your ${maxDiscount}% discount limit.`);
      withheld = true;
    }
  }

  // 2. Private numbers must not reach the buyer (walk-away price etc.)
  const privateFigures = figures(`${ctx.privateRules.walkAwayPrice} ${ctx.privateRules.discountApproval}`);
  const suggestionFigures = figures(t);
  if (t && [...suggestionFigures].some((f) => privateFigures.has(f))) {
    warnings.push("Withheld: it would reveal a private figure (for example your walk-away price) to the buyer.");
    withheld = true;
  }

  // 3. Every figure must come from the transcript or the product facts
  const allowed = figures(ctx.transcript + " " + formatProductFacts(ctx.productFacts));
  const unsupported = (t.match(FIGURE) ?? []).filter((f) => !allowed.has(normFigure(f)));
  if (unsupported.length) {
    warnings.push(
      `Check before using: ${[...new Set(unsupported)].join(", ")} does not appear in your facts or the transcript.`,
    );
  }

  // 4. Guarantees
  if (t && GUARANTEE_WORDS.test(t)) {
    warnings.push("Contains a guarantee. Only use it if your company can formally commit to it.");
  }

  return {
    text: withheld ? "" : t,
    basedOn: basedOn.filter(Boolean).slice(0, 4),
    clarifyingQuestion: cq,
    warnings,
    withheld,
  };
}
