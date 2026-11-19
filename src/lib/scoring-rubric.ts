/**
 * SCORING RUBRICS — the single place where scoring rules live.
 *
 * Three independent scores, each 0–100:
 *   Deal Health              – is this deal genuinely moving forward? (buyer-side evidence)
 *   Salesperson Performance  – how well did the seller run the call? (seller-side evidence)
 *   Illusion of Agreement    – how likely is it that apparent agreement is not real? (higher = more risk)
 *
 * How a score is calculated (scoring.ts, deterministic):
 *   1. Each criterion is judged from verified evidence as a value 0–1, or left out as
 *      "insufficient evidence" / "not applicable". Left-out criteria are never penalised.
 *   2. Score = 100 × Σ(weight × value) ÷ Σ(weight of judged criteria). Positive evidence earns
 *      points; negative evidence earns none. Nothing starts at 100.
 *   3. If less than MIN_COVERAGE of the stage's applicable weight could be judged, the score is
 *      shown as "Insufficient evidence" instead of a number.
 *   4. Caps: an explicit buyer rejection caps Deal Health (no live deal) and Illusion risk
 *      (the disagreement was explicit, not hidden).
 *
 * Weights change with the sales stage (detected from the transcript with a verified quote).
 * Double-counting guard: within one score, each finding or analysis list is read by exactly one
 * criterion (enforced by a test). The same objection can appear in two different scores only as
 * two different facets: whether it was resolved (Deal Health) and whether the seller answered it
 * (Salesperson Performance).
 *
 * These are heuristic coaching scores, NOT statistically calibrated win probabilities.
 * Weights are starting values, to be calibrated with sales-manager review and pilot data.
 */
import type { Evidence, Finding, FindingKey, Findings, Illusion, Objection, RealityItem, SalesStage, ScoreId } from "./types";

export type WeightedStage = Exclude<SalesStage, "UNKNOWN">;

/** Below this share of judged weight the score is "Insufficient evidence". */
export const MIN_COVERAGE = 0.5;

/** A "never happened" conclusion needs at least this many speaker turns; shorter calls are "insufficient". */
export const MIN_TURNS_FOR_ABSENCE = 6;

export interface RubricContext {
  findings: Findings;
  objections: Objection[];
  illusions: Illusion[];
  realityCheck: RealityItem[];
  stage: WeightedStage;
  /** Enough conversation to treat "it never happened" as evidence. */
  longEnough: boolean;
}

export type Quote = { quote: string; line: number | null };

export type Evaluation =
  | { outcome: "scored"; value: number; evidence: Quote[]; basedOnAbsence?: boolean; note: string }
  | { outcome: "insufficient" | "not_applicable"; note: string };

export interface Criterion {
  id: string;
  score: ScoreId;
  label: string;
  weights: Record<WeightedStage, number>;
  /** Sources this criterion reads ("finding:<key>", "objections", "illusions", "realityCheck"). */
  reads: string[];
  evaluate: (ctx: RubricContext) => Evaluation;
  rationale: string;
  recoveryAction: string;
  recommendation: string;
}

export interface CapRule {
  id: string;
  score: ScoreId;
  label: string;
  max: number;
  reads: string[];
  /** Returns the verified evidence that triggers the cap, or null. */
  trigger: (ctx: RubricContext) => Quote | null;
  recoveryAction: string;
  recommendation: string;
}

/* ---------------- helpers ---------------- */

const q = (f: Finding | Evidence | null | undefined): Quote[] =>
  f && f.verified && f.quote ? [{ quote: f.quote, line: f.line }] : [];

const all = (...lists: Quote[][]) => lists.flat();

const weights = (DISCOVERY: number, EVALUATION: number, NEGOTIATION: number) => ({ DISCOVERY, EVALUATION, NEGOTIATION });
const flat = (w: number) => weights(w, w, w);

/** A finding the model could not support, or whose quote failed verification. */
function unclear(f: Finding): Evaluation {
  return {
    outcome: "insufficient",
    note: f.verified ? "The transcript does not show this clearly either way." : "The evidence quote could not be verified in the transcript.",
  };
}

/**
 * Standard yes/no criterion. yes → 1 with its quote. no → 0, using the quote if there is one
 * (e.g. "Let me know when you're ready"), otherwise as absence, which needs a long enough call.
 */
function yesNo(key: FindingKey, yesNote: string, noNote: string) {
  return (ctx: RubricContext): Evaluation => {
    const f = ctx.findings[key];
    if (f.value === "unclear") return unclear(f);
    if (f.value === "yes") return { outcome: "scored", value: 1, evidence: q(f), note: yesNote };
    const ev = q(f);
    if (ev.length) return { outcome: "scored", value: 0, evidence: ev, note: noNote };
    if (!ctx.longEnough) return { outcome: "insufficient", note: "The call is too short to conclude that this never happened." };
    return { outcome: "scored", value: 0, evidence: [], basedOnAbsence: true, note: `${noNote} (not found anywhere in the call)` };
  };
}

/** Objections the code could verify and the model could classify. */
const judgedObjections = (ctx: RubricContext) =>
  ctx.objections.filter((o) => o.buyerConcern.verified && o.status !== "UNKNOWN");

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/* ---------------- Deal Health ---------------- */

const DEAL: Criterion[] = [
  {
    id: "deal-need",
    score: "deal",
    label: "Buyer confirmed a real problem",
    weights: weights(20, 10, 5),
    reads: ["finding:buyer_problem_confirmed"],
    evaluate: yesNo("buyer_problem_confirmed", "The buyer described a concrete problem in their own words.", "The buyer did not describe a problem they need solved"),
    rationale: "Deals move when the buyer owns the problem. Weighted most in discovery, where establishing the need is the goal.",
    recoveryAction: "Get the buyer to state the problem",
    recommendation: "Ask what is not working today and what it costs them, and let the buyer put it in their own words.",
  },
  {
    id: "deal-interest",
    score: "deal",
    label: "Genuine buying signals",
    weights: weights(15, 20, 15),
    reads: ["finding:buying_signal"],
    evaluate: yesNo("buying_signal", "The buyer showed interest beyond politeness.", "No buying signal beyond politeness"),
    rationale: "Questions about implementation, pricing detail, pilots or rollout show real interest. Polite phrases alone do not count.",
    recoveryAction: "Test for genuine interest",
    recommendation: "Ask a direct check-in question: “If this worked as discussed, what would you need to see to move forward?”",
  },
  {
    id: "deal-commitment",
    score: "deal",
    label: "Buyer made a concrete commitment",
    weights: weights(10, 20, 25),
    reads: ["finding:buyer_commitment"],
    evaluate: yesNo("buyer_commitment", "The buyer committed to a concrete action.", "The buyer made no concrete commitment"),
    rationale: "Commitments (agreeing to a pilot, sending an invite, sharing data, introducing an approver) are the strongest evidence a deal is real. Weighted most later in the cycle.",
    recoveryAction: "Secure a concrete buyer commitment",
    recommendation: "Ask for one small, specific action from the buyer, such as sharing sample data or adding the approver to a call.",
  },
  {
    id: "deal-next-step",
    score: "deal",
    label: "Clear, mutually agreed next step",
    weights: flat(20),
    reads: ["finding:next_step_agreed"],
    evaluate: yesNo("next_step_agreed", "A specific next action was agreed by both sides.", "No mutually agreed next step"),
    rationale: "A meeting is not required: any clear, agreed action with a time or owner counts (a pilot start, a document review by a date). Without one, deals drift.",
    recoveryAction: "Agree a specific next step",
    recommendation: "Propose one concrete next action with a date and an owner, and confirm it in writing after the call.",
  },
  {
    id: "deal-objections",
    score: "deal",
    label: "Objections resolved",
    weights: weights(10, 15, 20),
    reads: ["objections"],
    evaluate: (ctx) => {
      const obs = judgedObjections(ctx);
      if (!ctx.objections.length) return { outcome: "not_applicable", note: "The buyer raised no objections." };
      if (!obs.length) return { outcome: "insufficient", note: "Objections were found but none could be verified and classified." };
      const v = mean(obs.map((o) => (o.status === "RESOLVED_WITH_EVIDENCE" ? 1 : o.status === "POSSIBLY_UNRESOLVED" ? 0.4 : 0)));
      const resolved = obs.filter((o) => o.status === "RESOLVED_WITH_EVIDENCE").length;
      return { outcome: "scored", value: v, evidence: all(...obs.map((o) => all(q(o.buyerConcern), q(o.buyerFollowUp)))), note: `${resolved} of ${obs.length} objection${obs.length > 1 ? "s" : ""} resolved with the buyer's acknowledgement.` };
    },
    rationale: "Resolved = the buyer acknowledged the answer (1). Responded but unconfirmed (0.4). Ignored or avoided (0). Polite “okay” is not resolution.",
    recoveryAction: "Resolve the open objections",
    recommendation: "Go back to each open objection, ask what would resolve it, and confirm the buyer agrees it is resolved.",
  },
  {
    id: "deal-decision-maker",
    score: "deal",
    label: "Decision-maker engaged",
    weights: weights(5, 10, 15),
    reads: ["finding:decision_maker_required", "finding:decision_maker_engaged"],
    evaluate: (ctx) => {
      const req = ctx.findings.decision_maker_required;
      const eng = ctx.findings.decision_maker_engaged;
      if (req.value === "unclear") return unclear(req);
      if (req.value === "no") return { outcome: "not_applicable", note: "No one else was said to need to approve." };
      if (eng.value === "unclear") return unclear(eng);
      if (eng.value === "yes") return { outcome: "scored", value: 1, evidence: all(q(req), q(eng)), note: "The approver spoke on the call or a meeting with them was agreed." };
      return { outcome: "scored", value: 0, evidence: q(req), note: "Someone else must approve and they have not been engaged." };
    },
    rationale: "Applies only when the buyer says someone else must approve. Weighted most in negotiation.",
    recoveryAction: "Engage the decision-maker",
    recommendation: "Confirm who approves the budget and offer a short call with them, with material they can review beforehand.",
  },
  {
    id: "deal-budget",
    score: "deal",
    label: "Budget or decision timeline",
    weights: weights(0, 5, 10),
    reads: ["finding:budget_or_timeline_discussed"],
    evaluate: yesNo("budget_or_timeline_discussed", "A budget, spend limit or decision deadline was discussed.", "No budget or decision timeline was discussed"),
    rationale: "Not expected in a discovery call (weight 0). Matters more as the deal approaches a decision.",
    recoveryAction: "Confirm budget and decision timeline",
    recommendation: "Ask whether a budget is approved for this and by when they need to decide.",
  },
];

/* ---------------- Salesperson Performance ---------------- */

const SELLER: Criterion[] = [
  {
    id: "seller-discovery",
    score: "seller",
    label: "Discovery questions",
    weights: weights(25, 15, 5),
    reads: ["finding:discovery_questions_asked"],
    evaluate: yesNo("discovery_questions_asked", "The seller asked about the buyer's situation or goals.", "The seller pitched without asking about the buyer's situation"),
    rationale: "Understanding the buyer before pitching. Weighted most in discovery calls.",
    recoveryAction: "Run discovery before pitching",
    recommendation: "Open with two or three questions about how they handle this today and what is not working.",
  },
  {
    id: "seller-value",
    score: "seller",
    label: "Value linked to the buyer's need",
    weights: weights(15, 20, 15),
    reads: ["finding:value_linked_to_need"],
    evaluate: yesNo("value_linked_to_need", "The seller connected a specific capability to the buyer's stated problem.", "The seller listed features without tying them to the buyer's problem"),
    rationale: "Tailoring the pitch to what the buyer said, instead of listing features.",
    recoveryAction: "Tie the pitch to the buyer's problem",
    recommendation: "For each feature you mention, say which of the buyer's stated problems it solves, using only verified facts.",
  },
  {
    id: "seller-answers",
    score: "seller",
    label: "Answered the buyer's questions",
    weights: weights(15, 20, 15),
    reads: ["finding:buyer_questions_answered"],
    evaluate: (ctx) => {
      const f = ctx.findings.buyer_questions_answered;
      if (f.value === "unclear") return f.verified ? { outcome: "not_applicable", note: "The buyer asked no direct questions." } : unclear(f);
      // Double-counting guard: a dodge that is the reply to an objection is judged by
      // "Objection handling", so the same line is not penalised twice in this score.
      if (f.value === "no" && f.line !== null && judgedObjections(ctx).some((o) => o.sellerResponse?.verified && o.sellerResponse.line === f.line)) {
        return { outcome: "not_applicable", note: "The evasive reply was to an objection, so it is counted once, under Objection handling." };
      }
      return f.value === "yes"
        ? { outcome: "scored", value: 1, evidence: q(f), note: "The buyer's direct questions got specific answers." }
        : { outcome: "scored", value: 0, evidence: q(f), note: "At least one direct question got a vague or evasive answer." };
    },
    rationale: "Specific answers build credibility; “I'll get back to you” on basics destroys it. Needs a quote either way.",
    recoveryAction: "Answer the buyer's questions specifically",
    recommendation: "Before the next call, prepare concrete answers to this buyer's questions using your verified product facts.",
  },
  {
    id: "seller-objection-handling",
    score: "seller",
    label: "Objection handling",
    weights: weights(10, 15, 25),
    reads: ["objections"],
    evaluate: (ctx) => {
      const obs = judgedObjections(ctx);
      if (!ctx.objections.length) return { outcome: "not_applicable", note: "The buyer raised no objections." };
      if (!obs.length) return { outcome: "insufficient", note: "Objections were found but none could be verified and classified." };
      const v = mean(obs.map((o) => (o.status === "RESOLVED_WITH_EVIDENCE" ? 1 : o.status === "POSSIBLY_UNRESOLVED" ? 0.6 : 0)));
      const avoided = obs.filter((o) => o.status === "UNANSWERED_OR_AVOIDED").length;
      return { outcome: "scored", value: v, evidence: all(...obs.map((o) => (o.sellerResponse?.verified ? q(o.sellerResponse) : q(o.buyerConcern)))), note: avoided ? `${avoided} of ${obs.length} objection${obs.length > 1 ? "s were" : " was"} ignored or answered with features instead of substance.` : "Every objection got a substantive response." };
    },
    rationale: "Whether the seller engaged with each concern. A substantive answer the buyer has not yet confirmed still earns partial credit (0.6); avoiding it earns none.",
    recoveryAction: "Answer objections with substance",
    recommendation: "Acknowledge the concern, ask what is behind it, then answer with one verified fact. Avoid replying to price with a feature list.",
  },
  {
    id: "seller-competitor",
    score: "seller",
    label: "Competitor handled fairly",
    weights: flat(10),
    reads: ["finding:competitor_mentioned", "finding:competitor_addressed"],
    evaluate: (ctx) => {
      const m = ctx.findings.competitor_mentioned;
      const a = ctx.findings.competitor_addressed;
      if (m.value === "unclear") return unclear(m);
      if (m.value === "no") return { outcome: "not_applicable", note: "No competitor was mentioned." };
      if (a.value === "unclear") return unclear(a);
      return a.value === "yes"
        ? { outcome: "scored", value: 1, evidence: all(q(m), q(a)), note: "The seller asked about or fairly compared the alternative." }
        : { outcome: "scored", value: 0, evidence: q(m), note: "A competitor was mentioned and the seller did not engage with the comparison." };
    },
    rationale: "Applies only when the buyer brings up an alternative.",
    recoveryAction: "Address the competitor comparison",
    recommendation: "Ask what the competing offer includes (users, scope, setup) so the comparison is like-for-like.",
  },
  {
    id: "seller-claims",
    score: "seller",
    label: "Claims backed by evidence",
    weights: flat(10),
    reads: ["finding:unsupported_claims_made"],
    evaluate: (ctx) => {
      const f = ctx.findings.unsupported_claims_made;
      if (f.value === "yes") return { outcome: "scored", value: 0, evidence: q(f), note: "The seller made sweeping claims not backed by verified facts." };
      if (f.value === "unclear" && !f.verified) return unclear(f);
      return { outcome: "not_applicable", note: "No unsupported claims found. Penalty-only check, so it adds nothing when clean." };
    },
    rationale: "Penalty-only: “the best”, “India's leading” without proof lowers trust. Not making such claims is expected, so it earns nothing extra.",
    recoveryAction: "Replace claims with verified evidence",
    recommendation: "Swap superlatives for one verified, specific fact that matches the buyer's problem.",
  },
  {
    id: "seller-next-step",
    score: "seller",
    label: "Asked for a specific next step",
    weights: flat(15),
    reads: ["finding:seller_asked_for_next_step"],
    evaluate: yesNo("seller_asked_for_next_step", "The seller proposed a specific next step.", "The seller did not ask for a specific next step"),
    rationale: "Whether the seller tried to advance the deal. Separate from whether the buyer agreed (that is Deal Health).",
    recoveryAction: "Ask for a specific next step",
    recommendation: "End every call by proposing one concrete next action with a date, then confirm it.",
  },
];

/* ---------------- Illusion of Agreement Risk (value = risk, 1 = maximum) ---------------- */

const VERDICT_RISK: Record<RealityItem["verdict"], number> = { CONTRADICTED: 1, NOT_CONFIRMED: 0.6, INSUFFICIENT_EVIDENCE: 0.5, SUPPORTED: 0 };

const ILLUSION: Criterion[] = [
  {
    id: "ill-polite",
    score: "illusion",
    label: "Polite agreement without commitment",
    weights: flat(35),
    reads: ["illusions", "finding:buyer_commitment"],
    evaluate: (ctx) => {
      const ils = ctx.illusions.filter((i) => i.politePhrase.verified);
      // No polite phrases is not evidence that agreement is real, so it is not scored as "low risk".
      if (!ils.length) return { outcome: "not_applicable", note: "No polite phrases that could be mistaken for agreement." };
      // The agreed next step is judged by "ill-commitment-gap"; reading it here would count it twice.
      const committed = ctx.findings.buyer_commitment.value === "yes" && ctx.findings.buyer_commitment.verified;
      return {
        outcome: "scored",
        value: committed ? 0.5 : 1,
        evidence: all(...ils.map((i) => q(i.politePhrase)), committed ? q(ctx.findings.buyer_commitment) : []),
        note: committed ? "Polite phrases appear, but the buyer also made a concrete commitment." : `${ils.length} polite phrase${ils.length > 1 ? "s" : ""} with no concrete commitment from the buyer.`,
      };
    },
    rationale: "“Sounds good, we'll get back to you” feels like agreement but commits to nothing. A real commitment halves the risk.",
    recoveryAction: "Turn polite agreement into a commitment",
    recommendation: "When the buyer says “sounds good”, ask: “What would you need to see to take the next step, and by when?”",
  },
  {
    id: "ill-unresolved",
    score: "illusion",
    label: "Objections left open",
    weights: flat(25),
    reads: ["objections"],
    evaluate: (ctx) => {
      const obs = judgedObjections(ctx);
      if (!ctx.objections.length) return { outcome: "not_applicable", note: "The buyer raised no objections." };
      if (!obs.length) return { outcome: "insufficient", note: "Objections were found but none could be verified and classified." };
      const open = obs.filter((o) => o.status !== "RESOLVED_WITH_EVIDENCE");
      const v = mean(obs.map((o) => (o.status === "UNANSWERED_OR_AVOIDED" ? 1 : o.status === "POSSIBLY_UNRESOLVED" ? 0.5 : 0)));
      return { outcome: "scored", value: v, evidence: all(...(open.length ? open : obs).map((o) => q(o.buyerConcern))), note: `${open.length} of ${obs.length} objection${obs.length > 1 ? "s" : ""} not confirmed as resolved.` };
    },
    rationale: "Objections the buyer has not confirmed as resolved can sit behind a friendly ending. Avoided by the seller 1, answered but unconfirmed 0.5, resolved 0.",
    recoveryAction: "Confirm each objection is resolved",
    recommendation: "Ask the buyer directly whether each concern is resolved, rather than assuming silence means yes.",
  },
  {
    id: "ill-impression",
    score: "illusion",
    label: "Seller's impression vs the transcript",
    weights: flat(25),
    reads: ["realityCheck"],
    evaluate: (ctx) => {
      if (!ctx.realityCheck.length) return { outcome: "not_applicable", note: "No meeting impression was entered." };
      const items = ctx.realityCheck.filter((r) => r.evidence?.verified);
      if (!items.length) return { outcome: "insufficient", note: "No impression claim could be checked against a verified quote." };
      const bad = items.filter((r) => r.verdict === "CONTRADICTED").length;
      return { outcome: "scored", value: mean(items.map((r) => VERDICT_RISK[r.verdict])), evidence: all(...items.map((r) => q(r.evidence))), note: `${bad} of ${items.length} impression claim${items.length > 1 ? "s" : ""} contradicted by the transcript.` };
    },
    rationale: "If the seller believes things the call does not support, the deal is being forecast on an illusion. Contradicted 1, not confirmed 0.6, insufficient 0.5, supported 0.",
    recoveryAction: "Re-check the impression against the call",
    recommendation: "Update the CRM notes to match what the buyer actually said, and verify the rest on the next call.",
  },
  {
    id: "ill-commitment-gap",
    score: "illusion",
    label: "Positive talk without a next step",
    weights: flat(15),
    reads: ["finding:buying_signal", "finding:next_step_agreed"],
    evaluate: (ctx) => {
      const sig = ctx.findings.buying_signal;
      const ns = ctx.findings.next_step_agreed;
      if (ns.value === "yes" && ns.verified) return { outcome: "scored", value: 0, evidence: q(ns), note: "A concrete next step was agreed." };
      if (sig.value === "yes" && sig.verified && ns.value === "no") return { outcome: "scored", value: 1, evidence: q(sig), note: "The buyer sounded positive but nothing concrete was agreed." };
      return { outcome: "not_applicable", note: "No positive talk that lacked a next step." };
    },
    rationale: "Interest that never turns into an agreed action is the classic false-positive deal.",
    recoveryAction: "Convert interest into an agreed action",
    recommendation: "While interest is high, propose a specific next step with a date.",
  },
];

export const CRITERIA: Criterion[] = [...DEAL, ...SELLER, ...ILLUSION];

const rejection = (ctx: RubricContext): Quote | null => {
  const f = ctx.findings.buyer_rejected;
  return f.value === "yes" && f.verified ? { quote: f.quote, line: f.line } : null;
};

export const CAPS: CapRule[] = [
  {
    id: "cap-buyer-rejected",
    score: "deal",
    label: "Buyer rejected or ended the conversation",
    max: 10,
    reads: ["finding:buyer_rejected"],
    trigger: rejection,
    recoveryAction: "Re-earn permission to continue",
    recommendation: "Do not push. If you contact them again, apologise briefly, lead with one verified way you can help, and ask permission before pitching.",
  },
  {
    id: "cap-explicit-rejection",
    score: "illusion",
    label: "Disagreement was explicit, not hidden",
    max: 15,
    reads: ["finding:buyer_rejected"],
    trigger: rejection,
    recoveryAction: "",
    recommendation: "",
  },
];

export const SCORE_META: Record<ScoreId, { title: string; higherIsBetter: boolean; question: string }> = {
  deal: { title: "Deal Health", higherIsBetter: true, question: "Is this deal genuinely moving forward?" },
  seller: { title: "Salesperson Performance", higherIsBetter: true, question: "How well did the seller run the call?" },
  illusion: { title: "Illusion of Agreement Risk", higherIsBetter: false, question: "How likely is the apparent agreement not real?" },
};

/** Documented thresholds for each score's label. */
export const BANDS: Record<ScoreId, { min: number; max: number; label: string; tone: "red" | "amber" | "green"; description: string }[]> = {
  deal: [
    { min: 0, max: 39, label: "High risk", tone: "red", description: "Little evidence the deal is moving. Prioritise recovery before forecasting." },
    { min: 40, max: 69, label: "Moderate risk", tone: "amber", description: "Some progress, with material gaps. Fix them before the next stage." },
    { min: 70, max: 100, label: "Healthy", tone: "green", description: "Clear buyer evidence the deal is progressing. Keep confirming next steps." },
  ],
  seller: [
    { min: 0, max: 39, label: "Needs coaching", tone: "red", description: "Core call skills were missing. Review the criteria below with a coach." },
    { min: 40, max: 69, label: "Developing", tone: "amber", description: "Solid in places, with clear areas to improve." },
    { min: 70, max: 100, label: "Strong", tone: "green", description: "The call was well run. Keep doing what worked." },
  ],
  illusion: [
    { min: 0, max: 29, label: "Low", tone: "green", description: "Agreement on the call is backed by evidence." },
    { min: 30, max: 59, label: "Medium", tone: "amber", description: "Some apparent agreement is not confirmed. Verify before forecasting." },
    { min: 60, max: 100, label: "High", tone: "red", description: "Apparent agreement is largely unconfirmed. Do not forecast on it." },
  ],
};

export const SCORE_DISCLAIMER =
  "Heuristic coaching scores calculated in code from verified transcript evidence. Not statistically calibrated probabilities of winning.";
