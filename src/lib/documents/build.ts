/**
 * Browser-side helpers: build the isolated buyer-document input, the no-AI template draft,
 * and the final privacy scan over the documents the user is about to copy or print.
 */
import type { Analysis, DealInput, PrivateRules } from "../types";
import type { BuyerDocumentInput, BuyerPlan, GeneratedDocuments } from "./types";
import { buildMemo, reviewPlanItems, TBD, UNASSIGNED, type RawPlanItem } from "./review";
import { calculateScores, gaps } from "../scoring";

/** Picks ONLY approved fields. Private rules, the impression, marketing claims and the score never enter. */
export function toBuyerDocumentInput(a: Analysis, input: DealInput): BuyerDocumentInput {
  const f = input.productFacts;
  return {
    language: input.language,
    dealName: a.dealName.slice(0, 200),
    callSummary: a.callSummary.slice(0, 2000),
    buyerProblem: a.buyerProblem.slice(0, 1000),
    transcript: input.transcript.slice(0, 30_000),
    objections: a.objections.slice(0, 12).map((o) => ({
      title: o.title.slice(0, 200),
      category: o.category,
      status: o.status,
      buyerConcern: o.buyerConcern.quote.slice(0, 1000),
    })),
    stakeholders: a.stakeholders.slice(0, 12).map((s) => ({ name: s.name, role: s.role, side: s.side, status: s.status })),
    facts: {
      companyName: f.companyName,
      productName: f.productName,
      productDescription: f.productDescription,
      productPrice: f.productPrice,
      productFeatures: f.productFeatures,
      targetCustomers: f.targetCustomers,
      competitors: f.competitors,
      competitorPricing: f.competitorPricing,
      verifiedBenefits: f.verifiedBenefits,
      availableOffers: f.availableOffers,
    },
  };
}

/** Deterministic draft (no AI): only what the analysis supports. Everything is Proposed, TBD, Unassigned. */
export function templateDocuments(a: Analysis, docInput: BuyerDocumentInput): GeneratedDocuments {
  const { deal } = calculateScores(a);
  const raw: RawPlanItem[] = [];
  const ns = a.findings.next_step_agreed;
  if (ns.value === "yes" && ns.verified) {
    raw.push({ task: "Next step as agreed on the call", owner: "", status: "AGREED", dueDate: "", evidenceQuote: ns.quote, justification: "Agreed on the call." });
  }
  // Deal Health gaps only: Salesperson Performance gaps are private coaching, not buyer tasks.
  for (const c of gaps(deal)) {
    raw.push({ task: c.recommendation, owner: "", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: `Addresses: ${c.label.toLowerCase()}.` });
  }
  const { items } = reviewPlanItems(raw, docInput, "TEMPLATE");
  const openQuestions = a.objections
    .filter((o) => o.status !== "RESOLVED_WITH_EVIDENCE")
    .map((o) => `${o.title}: how should this be resolved?`);
  const plan: BuyerPlan = {
    title: `${a.dealName} · Mutual action plan`,
    meetingSummary: a.callSummary,
    decisions: [],
    openQuestions,
    items,
  };
  const { memo } = buildMemo(
    {
      businessContext: a.callSummary,
      problem: a.buyerProblem,
      proposedSolution: docInput.facts.productName ? `Adopt ${docInput.facts.productName}.` : "",
      risksAndQuestions: openQuestions,
      nextSteps: items.map((i) => i.task),
    },
    docInput,
    "TEMPLATE",
  );
  return {
    plan,
    memo,
    generatedBy: "template",
    model: null,
    notices: ["Basic draft built from the analysis without AI. All tasks are proposed; dates are TBD and owners Unassigned until you edit them."],
  };
}

/* ---------------- Final privacy scan (application code, runs before copy/print) ---------------- */

const FIGURE = /(?:₹|rs\.?\s?|inr\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lac|crore|cr|k))?|\d[\d,]*(?:\.\d+)?\s?(?:%|lakh|lac|crore|cr)/gi;
const normFig = (f: string) => f.toLowerCase().replace(/^(?:rs\.?|inr|₹)/, "").replace(/,|\s/g, "").replace(/lac$/, "lakh");
const PRIVATE_WORDS = /walk[- ]?away|floor price|maximum discount|max(?:imum)? discount|internal (?:rule|note|playbook)|deal health|health score|\b\d{1,3}\s?\/\s?100\b|at risk score|our lowest/i;

export interface PrivacyFinding {
  where: string;
  reason: string;
  excerpt: string;
}

function privateTokens(rules: PrivateRules, publicText: string) {
  const publicFigs = new Set((publicText.match(FIGURE) ?? []).map(normFig));
  const figs = new Set(
    (Object.values(rules).join(" ").match(FIGURE) ?? []).map(normFig).filter((f) => !publicFigs.has(f)),
  );
  const phrases = Object.values(rules)
    .flatMap((v) => v.split(/[;\n.]/))
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.split(/\s+/).length >= 3);
  return { figs, phrases };
}

/** n-word windows from the salesperson's private impression (confidential notes). */
function impressionShingles(impression: string, n = 6) {
  const w = impression.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(" "));
  return out;
}

export function scanForPrivateInfo(
  docs: { label: string; text: string }[],
  privateRules: PrivateRules,
  impression: string,
  publicText: string,
): PrivacyFinding[] {
  const { figs, phrases } = privateTokens(privateRules, publicText);
  const shingles = impressionShingles(impression);
  const findings: PrivacyFinding[] = [];
  for (const d of docs) {
    for (const line of d.text.split("\n")) {
      const l = line.toLowerCase();
      const normLine = l.replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ");
      const lineFigs = (line.match(FIGURE) ?? []).map(normFig);
      let reason: string | null = null;
      if (lineFigs.some((f) => figs.has(f))) reason = "contains a figure from your private sales rules";
      else if (phrases.some((p) => l.includes(p))) reason = "repeats a private sales rule";
      else if (PRIVATE_WORDS.test(line)) reason = "mentions internal pricing limits or the deal health score";
      else if (shingles.some((s) => normLine.includes(s))) reason = "repeats your private meeting notes";
      if (reason) findings.push({ where: d.label, reason, excerpt: line.trim().slice(0, 140) });
    }
  }
  return findings;
}

export { TBD, UNASSIGNED };
