/**
 * Code-level review of generated buyer documents (pure functions, used on the server and in tests).
 *  - AGREED / COMPLETED need a verified transcript quote, otherwise → PROPOSED (or UNKNOWN).
 *  - Due dates must appear in the transcript, otherwise → "TBD".
 *  - Owners must be a known stakeholder or company, otherwise → "Unassigned".
 *  - Memo fact sections (capabilities, benefits, pricing) are built from verified facts in code.
 *  - AI narrative sentences with unsupported figures or forbidden claims are removed.
 */
import { containsLoosely, indexTranscript, verifyQuote } from "../ai/evidence";
import type {
  ActionStatus,
  BuyerDocumentInput,
  BuyerPlan,
  CfoMemo,
  DocEvidence,
  MemoSection,
  PlanItem,
  VerifiedFacts,
} from "./types";
import { MEMO_HEADINGS } from "./types";

export const TBD = "TBD";
export const UNASSIGNED = "Unassigned";
export const BENEFITS_NEED_VALIDATION =
  "Financial benefits require validation. No verified ROI, cost-saving or payback figures have been provided.";

const FIGURE = /(?:₹|rs\.?\s?|inr\s?|\$|usd\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lac|crore|cr|k|m|million))?|\d[\d,]*(?:\.\d+)?\s?(?:%|lakh|lac|crore|cr|x\b)/gi;
/** Claims that may never be invented: ROI, testimonials, certifications, guarantees, contractual promises. */
const FORBIDDEN = [
  { re: /\broi\b|return on investment|payback/i, label: "ROI claim" },
  { re: /testimonial|"[^"]{10,}" ?[-—]\s?\w+|customer (?:said|says|told us)/i, label: "customer testimonial" },
  { re: /\bcertif(?:ied|ication)\b|\biso ?\d{3,5}\b|\bsoc ?2\b|\bhipaa\b|\bgdpr[- ]compliant\b/i, label: "certification" },
  { re: /\bguarantee[ds]?\b|\bguaranteed\b|\bwarrant(?:y|ies)\b/i, label: "guarantee" },
  { re: /\bcontractual(?:ly)?\b|\bsla\b|\bcommit(?:s|ted)? to (?:deliver|refund)/i, label: "contractual commitment" },
  { re: /\bsav(?:e|es|ing|ings)\b.*\b(?:₹|rs|lakh|crore|%)/i, label: "cost-saving figure" },
];

const normFig = (f: string) =>
  f.toLowerCase().replace(/^(?:rs\.?|inr|₹|\$|usd)/, "").replace(/,|\s/g, "").replace(/lac$/, "lakh");

export function factsText(f: VerifiedFacts) {
  return Object.values(f).join("\n");
}

function allowedFigures(input: BuyerDocumentInput) {
  return new Set(((input.transcript + "\n" + factsText(input.facts)).match(FIGURE) ?? []).map(normFig));
}

/** Removes sentences that contain unsupported figures or forbidden claims. Returns removed reasons. */
export function sanitizeNarrative(text: string, input: BuyerDocumentInput): { text: string; removed: string[] } {
  const allowed = allowedFigures(input);
  const source = (input.transcript + "\n" + factsText(input.facts)).toLowerCase();
  const removed: string[] = [];
  const keep = text
    .split(/(?<=[.!?।])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((sentence) => {
      const bad = (sentence.match(FIGURE) ?? []).filter((f) => !allowed.has(normFig(f)));
      if (bad.length) {
        removed.push(`unsupported figure ${[...new Set(bad)].join(", ")}`);
        return false;
      }
      for (const f of FORBIDDEN) {
        const m = sentence.match(f.re);
        if (m && !source.includes(m[0].toLowerCase())) {
          removed.push(f.label);
          return false;
        }
      }
      return true;
    });
  return { text: keep.join(" "), removed };
}

function evidenceOf(idx: ReturnType<typeof indexTranscript>, quote: string): DocEvidence | null {
  const e = verifyQuote(idx, quote);
  return e ? { quote: e.quote, verified: e.verified, line: e.line } : null;
}

export function knownOwners(input: BuyerDocumentInput) {
  return [
    ...input.stakeholders.map((s) => s.name),
    input.facts.companyName,
    input.dealName,
  ].filter((x) => x && x.trim().length > 1);
}

export function normalizeOwner(owner: string, input: BuyerDocumentInput) {
  const o = owner.trim();
  if (!o) return UNASSIGNED;
  const match = knownOwners(input).find((k) => o.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(o.toLowerCase()));
  return match ? o : UNASSIGNED;
}

export function normalizeDue(due: string, transcript: string) {
  const d = due.trim();
  if (!d || /^(tbd|tba|n\/a|none|unknown)$/i.test(d)) return TBD;
  return containsLoosely(transcript, d) ? d : TBD;
}

export function normalizeStatus(status: ActionStatus, evidence: DocEvidence | null): { status: ActionStatus; note: string | null } {
  if ((status === "AGREED" || status === "COMPLETED") && !evidence?.verified) {
    return { status: "PROPOSED", note: `Marked ${status.toLowerCase()} by the AI without a verified transcript quote, so shown as proposed.` };
  }
  return { status, note: null };
}

export interface RawPlanItem {
  task: string;
  owner: string;
  status: ActionStatus;
  dueDate: string;
  evidenceQuote: string;
  justification: string;
}

export function reviewPlanItems(items: RawPlanItem[], input: BuyerDocumentInput, source: PlanItem["source"]) {
  const idx = indexTranscript(input.transcript);
  const notices: string[] = [];
  let dates = 0;
  let owners = 0;
  let statuses = 0;
  const out: PlanItem[] = items
    .filter((i) => i.task.trim())
    .map((i, n) => {
      const evidence = evidenceOf(idx, i.evidenceQuote);
      const st = normalizeStatus(i.status, evidence);
      if (st.note) statuses++;
      const due = normalizeDue(i.dueDate, input.transcript);
      if (due === TBD && i.dueDate.trim() && !/^tbd$/i.test(i.dueDate.trim())) dates++;
      const owner = normalizeOwner(i.owner, input);
      if (owner === UNASSIGNED && i.owner.trim() && i.owner.trim() !== UNASSIGNED) owners++;
      return {
        id: `t-${n + 1}`,
        task: i.task.trim(),
        owner,
        status: st.status,
        due,
        evidence,
        justification: i.justification.trim(),
        source,
        edited: false,
      };
    });
  if (statuses) notices.push(`${statuses} task${statuses > 1 ? "s were" : " was"} changed to Proposed because no transcript quote confirmed ${statuses > 1 ? "them" : "it"}.`);
  if (dates) notices.push(`${dates} date${dates > 1 ? "s" : ""} not stated in the transcript ${dates > 1 ? "were" : "was"} replaced with TBD.`);
  if (owners) notices.push(`${owners} owner${owners > 1 ? "s" : ""} not found in the call ${owners > 1 ? "were" : "was"} set to Unassigned.`);
  return { items: out, notices };
}

export function reviewDecisions(decisions: { text: string; evidenceQuote: string }[], input: BuyerDocumentInput) {
  const idx = indexTranscript(input.transcript);
  let dropped = 0;
  const out = decisions
    .map((d) => ({ text: d.text.trim(), evidence: evidenceOf(idx, d.evidenceQuote) }))
    .filter((d): d is { text: string; evidence: DocEvidence } => {
      const ok = !!d.text && !!d.evidence?.verified;
      if (!ok) dropped++;
      return ok;
    });
  return { decisions: out, notices: dropped ? [`${dropped} “confirmed decision${dropped > 1 ? "s" : ""}” without a transcript quote ${dropped > 1 ? "were" : "was"} removed.`] : [] };
}

const bullets = (items: string[]) => items.filter((x) => x.trim()).map((x) => `• ${x.trim()}`).join("\n");
const splitList = (t: string) =>
  t
    .split(/[;\n]|,(?![^(]*\))/)
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter((x) => x.length > 1);

/** Sections 4–6 come straight from verified facts: the AI cannot add to them. */
export function factSections(f: VerifiedFacts): Pick<Record<string, MemoSection>, "capabilities" | "benefits" | "pricing"> {
  const capabilityLines = [
    f.productName && f.productDescription ? `${f.productName}: ${f.productDescription.replace(/\.$/, "")}` : f.productDescription,
    ...splitList(f.productFeatures),
  ].filter(Boolean) as string[];
  const benefits = f.verifiedBenefits.split(/[;\n]/).map((b) => b.trim()).filter(Boolean);
  const pricing = [
    f.productPrice ? `List price: ${f.productPrice}` : "Pricing to be confirmed by the vendor.",
    f.availableOffers && `Current offer: ${f.availableOffers}`,
    f.competitorPricing && `Alternative considered: ${f.competitorPricing}${f.competitors && !f.competitorPricing.includes(f.competitors) ? ` (${f.competitors})` : ""}. Scope to be compared like-for-like.`,
  ].filter(Boolean) as string[];
  return {
    capabilities: {
      key: "capabilities",
      heading: MEMO_HEADINGS.capabilities,
      body: capabilityLines.length ? bullets(capabilityLines) : "No verified capabilities were provided. [Vendor to supply a capability summary.]",
      origin: "FACTS",
    },
    benefits: {
      key: "benefits",
      heading: MEMO_HEADINGS.benefits,
      body: benefits.length ? `${bullets(benefits)}\n${BENEFITS_NEED_VALIDATION.replace("No verified", "Results for this buyer are not yet validated; no")}` : BENEFITS_NEED_VALIDATION,
      origin: "FACTS",
    },
    pricing: { key: "pricing", heading: MEMO_HEADINGS.pricing, body: bullets(pricing), origin: "FACTS" },
  };
}

export function buildMemo(
  ai: { businessContext: string; problem: string; proposedSolution: string; risksAndQuestions: string[]; nextSteps: string[] },
  input: BuyerDocumentInput,
  origin: "AI" | "TEMPLATE",
): { memo: CfoMemo; notices: string[] } {
  const removed: string[] = [];
  const clean = (t: string) => {
    const r = sanitizeNarrative(t, input);
    removed.push(...r.removed);
    return r.text;
  };
  const cleanList = (xs: string[]) => xs.map(clean).filter(Boolean);
  const facts = factSections(input.facts);
  const approver = input.stakeholders.find((s) => s.side === "buyer" && s.status !== "CONFIRMED_PRESENT");
  const sections: MemoSection[] = [
    { key: "businessContext", heading: MEMO_HEADINGS.businessContext, body: clean(ai.businessContext) || "[Business context — to be completed]", origin },
    { key: "problem", heading: MEMO_HEADINGS.problem, body: clean(ai.problem) || input.buyerProblem || "[Problem — buyer to confirm]", origin },
    { key: "proposedSolution", heading: MEMO_HEADINGS.proposedSolution, body: clean(ai.proposedSolution) || "[Proposed solution — to be completed]", origin },
    facts.capabilities,
    facts.benefits,
    facts.pricing,
    { key: "risks", heading: MEMO_HEADINGS.risks, body: bullets(cleanList(ai.risksAndQuestions)) || "• [None recorded]", origin },
    { key: "nextSteps", heading: MEMO_HEADINGS.nextSteps, body: bullets(cleanList(ai.nextSteps)) || "• [To be agreed]", origin },
  ];
  const product = input.facts.productName || "the proposed solution";
  return {
    memo: {
      subject: `Purchase justification: ${product}${input.dealName && input.dealName !== "This deal" ? ` for ${input.dealName}` : ""}`,
      to: approver ? `${approver.name}${approver.role && approver.role !== "Role not stated" ? `, ${approver.role}` : ""}` : "[Approver — buyer to confirm]",
      sections,
    },
    notices: removed.length ? [`${removed.length} memo sentence${removed.length > 1 ? "s were" : " was"} removed (${[...new Set(removed)].join("; ")}).`] : [],
  };
}

export function planToText(plan: BuyerPlan) {
  const confirmed = plan.items.filter((i) => i.status === "AGREED" || i.status === "COMPLETED");
  const proposed = plan.items.filter((i) => i.status === "PROPOSED" || i.status === "UNKNOWN");
  const row = (i: PlanItem) => `- ${i.task} | Owner: ${i.owner} | Due: ${i.due} | ${label(i.status)}`;
  return [
    plan.title,
    "",
    "Meeting summary",
    plan.meetingSummary,
    "",
    "Confirmed decisions",
    ...(plan.decisions.length ? plan.decisions.map((d) => `- ${d.text}`) : ["- None confirmed yet"]),
    "",
    "Open questions",
    ...(plan.openQuestions.length ? plan.openQuestions.map((q) => `- ${q}`) : ["- None"]),
    "",
    "Agreed next steps",
    ...(confirmed.length ? confirmed.map(row) : ["- None agreed yet"]),
    "",
    "Proposed next steps (for your confirmation)",
    ...(proposed.length ? proposed.map(row) : ["- None"]),
  ].join("\n");
}

export function memoToText(m: CfoMemo) {
  return [`To: ${m.to}`, `Subject: ${m.subject}`, "", ...m.sections.flatMap((s) => [s.heading, s.body, ""])].join("\n").trim();
}

export function label(s: ActionStatus) {
  return { AGREED: "Agreed", PROPOSED: "Proposed", COMPLETED: "Completed", UNKNOWN: "Unknown" }[s];
}
