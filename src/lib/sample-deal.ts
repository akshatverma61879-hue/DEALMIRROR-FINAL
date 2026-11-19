/**
 * SAMPLE DEAL — fictional data for the demo. No real company, person or price.
 *
 * Every pre-computed result below is produced by the app's own code from the sample transcript:
 * quotes are verified with verifyQuote, suggestions pass guardSuggestion, documents pass the
 * Phase 6 review rules. The score is NOT stored: it is calculated by scoring.ts from the findings.
 *
 * Worked example (rubrics in scoring-rubric.ts, evaluation-stage weights):
 *   Deal Health 32   – earned: confirmed problem, buying signal (setup question), partly answered objections;
 *                      missed: commitment, agreed next step, CFO engagement, budget/timeline.
 *   Salesperson 41   – earned: value tied to the need, answered the setup question, partial objection handling;
 *                      missed: discovery, competitor comparison, unsupported claim, next-step ask.
 *   Illusion risk 84 – polite "we'll think about it" with no commitment, open objections, optimistic impression.
 *   Simulator: closing every Deal Health gap reaches 100 (hypothetical).
 */
import type { Analysis, DealInput, Evidence, Objection } from "./types";
import { SPEAKER_LINE } from "./types";
import { indexTranscript, verifyQuote } from "./ai/evidence";
import { guardSuggestion } from "./ai/guards";
import { buildMemo, reviewPlanItems } from "./documents/review";
import type { BuyerDocumentInput, GeneratedDocuments } from "./documents/types";
import type { Persona } from "./practice/types";

export const SAMPLE_LABEL = "Sample Demo — Fictional Data";

export const SAMPLE_DEAL_INPUT: DealInput = {
  language: "English",
  transcript: `Arjun (Sales): Good morning Rohit, thanks for making time today. Shall I walk you through SalesPro CRM?
Rohit (Buyer): Sure. Right now our 25-person sales team tracks leads in spreadsheets and WhatsApp, and follow-ups keep slipping.
Arjun (Sales): That's exactly what SalesPro solves. You get pipeline tracking, automatic follow-up reminders and a mobile app for the field team.
Rohit (Buyer): Looks good. But honestly, ₹5 lakh a year is expensive. LeadLine quoted us ₹3 lakh a year.
Arjun (Sales): Sir, SalesPro is a much better product, with more features and a cleaner interface.
Rohit (Buyer): Okay. Hmm. How long does setup usually take?
Arjun (Sales): Usually about three weeks, including data migration.
Rohit (Buyer): Fine. Anything above ₹3 lakh needs approval from our CFO, Meera, so I'll have to discuss it with her.
Arjun (Sales): Sure sir, of course.
Rohit (Buyer): Okay, sounds good. We'll think about it and get back to you.
Arjun (Sales): Absolutely. Please let me know whenever you're ready. Thank you!`,
  productFacts: {
    companyName: "SalesPro Software Pvt Ltd (fictional)",
    productName: "SalesPro CRM",
    productDescription: "B2B CRM software for growing sales teams.",
    productPrice: "₹5 lakh per year (up to 30 users)",
    productFeatures: "Pipeline tracking; automatic follow-up reminders; mobile app for field teams; setup in about three weeks including data migration",
    targetCustomers: "B2B companies with 10–50 salespeople",
    competitors: "LeadLine (fictional)",
    competitorPricing: "LeadLine quoted ₹3 lakh per year (scope unknown)",
    verifiedBenefits: "Illustrative figure: 3 existing customers reduced missed follow-ups by 30% in their first quarter",
    availableOffers: "",
    marketingClaims: "Best CRM for Indian SMBs; easiest CRM to use",
  },
  privateRules: {
    maxDiscount: "10%",
    walkAwayPrice: "₹4 lakh",
    discountApproval: "Any discount above 5% needs sales head approval",
    negotiationRestrictions: "Do not offer free months before the buyer states a budget",
    neverPromise: "24/7 support; custom integrations",
    additionalInstructions: "",
  },
  impression: {
    text: "The meeting went very well, the buyer liked the product, and I think we are close to closing.",
    confidence: 5,
  },
};

/** Kept for older imports. */
export const SAMPLE_NOVA_INPUT = SAMPLE_DEAL_INPUT;

const idx = indexTranscript(SAMPLE_DEAL_INPUT.transcript);
function q(text: string): Evidence {
  const e = verifyQuote(idx, text);
  if (!e || !e.verified) throw new Error(`Sample quote not found in transcript: ${text}`);
  return e;
}
const finding = (value: "yes" | "no" | "unclear", quote: string) => {
  const e = q(quote);
  return { value, quote: e.quote, verified: true, line: e.line };
};
const guardCtx = {
  transcript: SAMPLE_DEAL_INPUT.transcript,
  productFacts: SAMPLE_DEAL_INPUT.productFacts,
  privateRules: SAMPLE_DEAL_INPUT.privateRules,
};
const suggest = (text: string, basedOn: string[], clarifying = "") => guardSuggestion(text, basedOn, clarifying, guardCtx);

const PRICE_CONCERN = "But honestly, ₹5 lakh a year is expensive.";
const GENERIC_REPLY = "Sir, SalesPro is a much better product, with more features and a cleaner interface.";
const POLITE_CLOSE = "Okay, sounds good. We'll think about it and get back to you.";

const objections: Objection[] = [
  {
    id: "obj-1",
    category: "PRICING",
    title: "Price feels too high",
    buyerConcern: q(PRICE_CONCERN),
    sellerResponse: q(GENERIC_REPLY),
    buyerFollowUp: q("Okay. Hmm. How long does setup usually take?"),
    explanation:
      "The seller answered a price concern with a general “better product” claim. The buyer changed the subject without accepting the price.",
    status: "UNANSWERED_OR_AVOIDED",
    confidence: "high",
    isInferred: false,
    needsReview: false,
    suggestion: suggest(
      "Rohit, that's fair to ask. You mentioned follow-ups keep slipping for your 25-person team. Three of our customers reduced missed follow-ups by 30% (illustrative figure). Could we work out what that would mean for your pipeline before comparing prices?",
      ["Transcript: follow-ups keep slipping, 25-person team", "Verified benefit (illustrative): 30% fewer missed follow-ups"],
      "What would a missed follow-up typically cost your team?",
    ),
  },
  {
    id: "obj-2",
    category: "COMPETITION",
    title: "Cheaper competitor quote",
    buyerConcern: q("LeadLine quoted us ₹3 lakh a year."),
    sellerResponse: q(GENERIC_REPLY),
    buyerFollowUp: q("Okay. Hmm. How long does setup usually take?"),
    explanation: "No like-for-like comparison. “Much better product” is an unverified marketing claim, not an answer.",
    status: "UNANSWERED_OR_AVOIDED",
    confidence: "high",
    isInferred: false,
    needsReview: false,
    suggestion: suggest(
      "Could you share what LeadLine's ₹3 lakh includes — number of users, mobile app, data migration? I want the comparison to be fair to you.",
      ["Competitor pricing: LeadLine ₹3 lakh (scope unknown)"],
    ),
  },
  {
    id: "obj-3",
    category: "STAKEHOLDER_APPROVAL",
    title: "CFO approval required",
    buyerConcern: q("Anything above ₹3 lakh needs approval from our CFO, Meera, so I'll have to discuss it with her."),
    sellerResponse: q("Sure sir, of course."),
    buyerFollowUp: q(POLITE_CLOSE),
    explanation: "The approver was named, but the seller did not offer to join that conversation or prepare anything for her.",
    status: "POSSIBLY_UNRESOLVED",
    confidence: "high",
    isInferred: false,
    needsReview: false,
    suggestion: suggest(
      "Would it help if I joined a 30-minute call with Meera this week and walked her through the numbers?",
      [],
      "What will Meera need to see to approve this?",
    ),
  },
];

export const SAMPLE_ANALYSIS: Analysis = {
  source: "sample",
  model: null,
  generatedAt: "2026-11-19T00:00:00.000Z",
  dealName: "Nova Retail (fictional)",
  dealValue: SAMPLE_DEAL_INPUT.productFacts.productPrice,
  buyerProblem: "The 25-person sales team tracks leads in spreadsheets and WhatsApp, and follow-ups keep slipping.",
  callSummary:
    "Arjun demoed SalesPro CRM to Rohit, whose 25-person team tracks leads in spreadsheets and WhatsApp. Rohit called ₹5 lakh a year expensive against a ₹3 lakh LeadLine quote and said the CFO, Meera, must approve anything above ₹3 lakh. The call ended with “we'll think about it” and no next meeting.",
  objections,
  illusions: [
    {
      id: "ill-1",
      objectionId: "obj-1",
      politePhrase: q(POLITE_CLOSE),
      buyerConcern: q(PRICE_CONCERN),
      sellerResponse: q(GENERIC_REPLY),
      buyerFollowUp: q(POLITE_CLOSE),
      addressed: "Product quality and features, in general terms.",
      unconfirmed: "Whether the ₹2 lakh gap to LeadLine is justified, and whether the CFO will approve.",
      falseConfidence: "“Sounds good” is polite, but no concern was confirmed as resolved and no next step was agreed.",
      clarificationToSeek: "Ask what would need to be true for the price to make sense, and offer a dated call with the CFO.",
      uncertainty: "medium",
      needsReview: false,
    },
  ],
  realityCheck: [
    {
      claim: "The meeting went very well",
      evidence: q(POLITE_CLOSE),
      verdict: "NOT_CONFIRMED",
      explanation: "The tone was polite, but two objections were left open and nothing was agreed.",
      needsReview: false,
    },
    {
      claim: "the buyer liked the product",
      evidence: q("Looks good."),
      verdict: "SUPPORTED",
      explanation: "Rohit said “Looks good” about the demo, though he raised price straight after.",
      needsReview: false,
    },
    {
      claim: "I think we are close to closing",
      evidence: q("Anything above ₹3 lakh needs approval from our CFO, Meera, so I'll have to discuss it with her."),
      verdict: "CONTRADICTED",
      explanation: "The price concern is open, the CFO has not been engaged and no next meeting is booked.",
      needsReview: false,
    },
  ],
  stakeholders: [
    { id: "sh-1", name: "Arjun", role: "Sales", side: "seller", status: "CONFIRMED_PRESENT", evidence: q("Good morning Rohit, thanks for making time today."), mentionedBy: null, basis: "Speaks in the transcript as “Arjun (Sales)”." },
    { id: "sh-2", name: "Rohit", role: "Buyer (evaluator)", side: "buyer", status: "CONFIRMED_PRESENT", evidence: q("our 25-person sales team tracks leads in spreadsheets and WhatsApp"), mentionedBy: null, basis: "Speaks in the transcript as “Rohit (Buyer)”." },
    { id: "sh-3", name: "Meera", role: "CFO (approver)", side: "buyer", status: "MENTIONED_ONLY", evidence: q("Anything above ₹3 lakh needs approval from our CFO, Meera"), mentionedBy: "Rohit (Buyer)", basis: "Referred to in the transcript but does not speak, so attendance is not confirmed." },
  ],
  relationships: [{ from: "sh-3", to: "sh-2", type: "APPROVES", evidence: q("Anything above ₹3 lakh needs approval from our CFO, Meera") }],
  findings: {
    buyer_problem_confirmed: finding("yes", "our 25-person sales team tracks leads in spreadsheets and WhatsApp, and follow-ups keep slipping."),
    buying_signal: finding("yes", "How long does setup usually take?"),
    buyer_commitment: finding("no", "We'll think about it and get back to you."),
    next_step_agreed: finding("no", "Please let me know whenever you're ready."),
    decision_maker_required: finding("yes", "Anything above ₹3 lakh needs approval from our CFO, Meera"),
    decision_maker_engaged: finding("no", "Sure sir, of course."),
    budget_or_timeline_discussed: finding("no", "We'll think about it and get back to you."),
    buyer_rejected: finding("no", "We'll think about it and get back to you."),
    competitor_mentioned: finding("yes", "LeadLine quoted us ₹3 lakh a year."),
    discovery_questions_asked: finding("no", "Shall I walk you through SalesPro CRM?"),
    value_linked_to_need: finding("yes", "You get pipeline tracking, automatic follow-up reminders and a mobile app for the field team."),
    buyer_questions_answered: finding("yes", "Usually about three weeks, including data migration."),
    competitor_addressed: finding("no", GENERIC_REPLY),
    unsupported_claims_made: finding("yes", GENERIC_REPLY),
    seller_asked_for_next_step: finding("no", "Please let me know whenever you're ready."),
  },
  salesStage: { stage: "EVALUATION", evidence: q("Shall I walk you through SalesPro CRM?") },
  speakerTurns: SAMPLE_DEAL_INPUT.transcript.split("\n").filter((l) => SPEAKER_LINE.test(l)).length,
  notices: [`${SAMPLE_LABEL}. Pre-computed from the sample transcript; no AI was called.`],
};

/* ---------------- Pre-computed documents (pass the Phase 6 review rules) ---------------- */

const docInput: BuyerDocumentInput = {
  language: "English",
  dealName: SAMPLE_ANALYSIS.dealName,
  callSummary: SAMPLE_ANALYSIS.callSummary,
  buyerProblem: SAMPLE_ANALYSIS.buyerProblem,
  transcript: SAMPLE_DEAL_INPUT.transcript,
  objections: objections.map((o) => ({ title: o.title, category: o.category, status: o.status, buyerConcern: o.buyerConcern.quote })),
  stakeholders: SAMPLE_ANALYSIS.stakeholders.map((s) => ({ name: s.name, role: s.role, side: s.side, status: s.status })),
  facts: (() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { marketingClaims, ...verified } = SAMPLE_DEAL_INPUT.productFacts;
    return verified;
  })(),
};

const planReview = reviewPlanItems(
  [
    { task: "Share a like-for-like comparison with the LeadLine quote (users, mobile app, data migration)", owner: "Arjun", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "The price comparison is still open." },
    { task: "Confirm current follow-up effort so the value can be sized", owner: "Rohit", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "Needed to compare cost with value." },
    { task: "30-minute review call with Meera (CFO)", owner: "Rohit", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "CFO approval is required above ₹3 lakh." },
    { task: "Agree a date for the next conversation", owner: "Arjun", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "No next meeting was agreed on the call." },
  ],
  docInput,
  "AI",
);

const memoBuild = buildMemo(
  {
    businessContext: "Nova Retail's 25-person sales team tracks leads in spreadsheets and WhatsApp.",
    problem: "Follow-ups keep slipping, so leads are lost or delayed.",
    proposedSolution: "Adopt SalesPro CRM to track the pipeline and send automatic follow-up reminders, including for the field team on mobile.",
    risksAndQuestions: [
      "Price is above a ₹3 lakh alternative quote; scope of that quote is unknown.",
      "Approval by the CFO is required and has not yet been discussed.",
      "No approved budget or decision timeline has been confirmed.",
    ],
    nextSteps: ["Compare the two offers like-for-like.", "Hold a 30-minute review with the CFO.", "Agree a decision timeline."],
  },
  docInput,
  "AI",
);

export const SAMPLE_DOCUMENTS: GeneratedDocuments = {
  plan: {
    title: "Nova Retail × SalesPro CRM · Mutual action plan",
    meetingSummary:
      "Rohit described how the 25-person sales team tracks leads in spreadsheets and WhatsApp, and that follow-ups keep slipping. He raised the ₹5 lakh price against a ₹3 lakh LeadLine quote and noted that the CFO, Meera, approves purchases above ₹3 lakh. No next meeting has been set yet.",
    decisions: [],
    openQuestions: [
      "What does the LeadLine quote include?",
      "What budget is approved for a CRM this year?",
      "When would the CFO be available for a short review?",
    ],
    items: planReview.items,
  },
  memo: memoBuild.memo,
  generatedBy: "sample",
  model: null,
  notices: [`${SAMPLE_LABEL}. Pre-computed documents; no AI was called. All tasks are proposed.`],
};

/* ---------------- Sample practice persona (used by the scripted, no-AI practice) ---------------- */

export const SAMPLE_PERSONA: Persona = {
  name: "Vikram Mehta",
  role: "Head of Sales Operations (fictional)",
  businessConcerns: [
    { text: "₹5 lakh vs a ₹3 lakh competitor quote", source: "TRANSCRIPT" },
    { text: "CFO approval needed above ₹3 lakh", source: "TRANSCRIPT" },
    { text: "Wants proof the follow-up improvement applies to a 25-person team", source: "SIMULATED" },
  ],
  negotiationStyle: "Polite but data-driven; compares vendors line by line.",
  objectionSummary: "Believes SalesPro CRM is overpriced compared with LeadLine.",
};
