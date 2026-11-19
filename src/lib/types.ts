import { z } from "zod";
import { LIMITS } from "./limits";

/* ---------- Input ---------- */

export const LANGUAGES = ["English", "Hindi", "Hinglish"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Removes control characters (keeps newlines and tabs) and normalises line endings. */
export function sanitizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

const text = (max: number, label: string) =>
  z
    .string({ error: `${label} must be text.` })
    .max(max, `${label} is too long (max ${max.toLocaleString()} characters).`)
    .transform(sanitizeText);

const optionalText = (max: number, label: string) => text(max, label).optional().default("");

/** A speaker label is the text before the first colon on a line: "Rohit (Buyer):", "CFO:", "विक्रेता:". */
export const SPEAKER_LINE = /^\s*([^:\n\d][^:\n]{0,39}?)\s*:\s*\S/;

export function detectSpeakers(transcript: string) {
  const map = new Map<string, { label: string; lines: number }>();
  for (const line of transcript.split("\n")) {
    const m = line.match(SPEAKER_LINE);
    if (!m) continue;
    const label = m[1].trim();
    if (label.split(/\s+/).length > 5 || /https?$/i.test(label)) continue;
    const key = label.toLowerCase();
    map.set(key, { label, lines: (map.get(key)?.lines ?? 0) + 1 });
  }
  return [...map.values()];
}

export const productFactsSchema = z.object({
  companyName: optionalText(LIMITS.shortField, "Company name"),
  productName: optionalText(LIMITS.shortField, "Product name"),
  productDescription: optionalText(LIMITS.longField, "Product description"),
  productPrice: optionalText(LIMITS.shortField, "Product price"),
  productFeatures: optionalText(LIMITS.mediumField, "Product features"),
  targetCustomers: optionalText(LIMITS.mediumField, "Target customers"),
  competitors: optionalText(LIMITS.shortField, "Competitors"),
  competitorPricing: optionalText(LIMITS.mediumField, "Competitor pricing"),
  verifiedBenefits: optionalText(LIMITS.longField, "Verified customer benefits"),
  availableOffers: optionalText(LIMITS.mediumField, "Available offers"),
  /** Kept apart from verified facts: the AI may never present these as proof. */
  marketingClaims: optionalText(LIMITS.longField, "Marketing claims"),
});

export const privateRulesSchema = z.object({
  maxDiscount: optionalText(LIMITS.shortField, "Maximum discount"),
  walkAwayPrice: optionalText(LIMITS.shortField, "Walk-away price"),
  discountApproval: optionalText(LIMITS.mediumField, "Discount approval requirements"),
  negotiationRestrictions: optionalText(LIMITS.mediumField, "Negotiation restrictions"),
  neverPromise: optionalText(LIMITS.mediumField, "Promises never to make"),
  additionalInstructions: optionalText(LIMITS.longField, "Additional internal instructions"),
});

export const CONFIDENCE_LEVELS = [1, 2, 3, 4, 5] as const;

export const impressionSchema = z.object({
  text: optionalText(LIMITS.impressionMax, "Meeting impression"),
  confidence: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .optional()
    .default(null),
});

export const dealInputSchema = z.object({
  transcript: z
    .string({ error: "Transcript must be text." })
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, "Paste a call transcript to continue.")
        .min(LIMITS.transcriptMin, `Transcript is too short to analyse (min ${LIMITS.transcriptMin} characters).`)
        .max(LIMITS.transcriptMax, `Transcript is too long (max ${LIMITS.transcriptMax.toLocaleString()} characters). Please shorten it.`)
        .refine((t) => detectSpeakers(t).length >= LIMITS.minSpeakers, {
          message: 'Add speaker labels so seller and buyer can be told apart, e.g. "Salesperson:" and "Buyer:".',
        }),
    ),
  language: z.enum(LANGUAGES),
  productFacts: productFactsSchema,
  privateRules: privateRulesSchema,
  impression: impressionSchema,
});

export type ProductFacts = z.output<typeof productFactsSchema>;
export type PrivateRules = z.output<typeof privateRulesSchema>;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** What the form holds while the user is typing (unvalidated). */
export interface DealInput {
  transcript: string;
  language: Language;
  productFacts: ProductFacts;
  privateRules: PrivateRules;
  impression: { text: string; confidence: Confidence | null };
}

/** What validation returns: sanitised and length-checked. */
export type ValidDealInput = z.output<typeof dealInputSchema>;

/** Buyer-safe subset: everything except private rules and the seller's own impression. */
export const buyerSafeInputSchema = dealInputSchema.pick({ language: true, productFacts: true });

/* ---------- Analysis (normalised result shown in the UI) ---------- */

export const OBJECTION_CATEGORIES = [
  "PRICING",
  "PRODUCT_FUNCTIONALITY",
  "COMPETITION",
  "IMPLEMENTATION",
  "SECURITY",
  "COMPLIANCE",
  "ROI",
  "BUDGET",
  "TIMELINE",
  "STAKEHOLDER_APPROVAL",
  "OTHER",
] as const;
export const objectionCategory = z.enum(OBJECTION_CATEGORIES);

export const OBJECTION_STATUSES = [
  "RESOLVED_WITH_EVIDENCE",
  "POSSIBLY_UNRESOLVED",
  "UNANSWERED_OR_AVOIDED",
  "UNKNOWN",
] as const;
export const objectionStatus = z.enum(OBJECTION_STATUSES);

export const REALITY_VERDICTS = ["SUPPORTED", "CONTRADICTED", "NOT_CONFIRMED", "INSUFFICIENT_EVIDENCE"] as const;
export const realityVerdict = z.enum(REALITY_VERDICTS);

export const confidenceLevel = z.enum(["high", "medium", "low"]);

/** A quote plus the result of checking it against the transcript in code. */
export const evidenceSchema = z.object({
  quote: z.string(),
  /** true only if the quote was found in the transcript (exact text, ignoring spacing/quote marks/case). */
  verified: z.boolean(),
  line: z.number().int().nullable(),
  start: z.number().int().nullable(),
  end: z.number().int().nullable(),
});

export const suggestionSchema = z.object({
  text: z.string(),
  basedOn: z.array(z.string()),
  clarifyingQuestion: z.string().nullable(),
  /** Code-level guard results (discount limit, unsupported figures, private info, guarantees). */
  warnings: z.array(z.string()),
  /** true when a guard withheld the text (e.g. discount above the limit). */
  withheld: z.boolean(),
});

export const objectionSchema = z.object({
  id: z.string(),
  category: objectionCategory,
  title: z.string(),
  buyerConcern: evidenceSchema,
  sellerResponse: evidenceSchema.nullable(),
  buyerFollowUp: evidenceSchema.nullable(),
  explanation: z.string(),
  status: objectionStatus,
  confidence: confidenceLevel,
  isInferred: z.boolean(),
  needsReview: z.boolean(),
  suggestion: suggestionSchema.nullable(),
});

export const illusionSchema = z.object({
  id: z.string(),
  objectionId: z.string().nullable(),
  politePhrase: evidenceSchema,
  buyerConcern: evidenceSchema.nullable(),
  sellerResponse: evidenceSchema.nullable(),
  buyerFollowUp: evidenceSchema.nullable(),
  addressed: z.string(),
  unconfirmed: z.string(),
  falseConfidence: z.string(),
  clarificationToSeek: z.string(),
  uncertainty: confidenceLevel,
  needsReview: z.boolean(),
});

export const realityItemSchema = z.object({
  claim: z.string(),
  evidence: evidenceSchema.nullable(),
  verdict: realityVerdict,
  explanation: z.string(),
  needsReview: z.boolean(),
});

export const PARTICIPATION = ["CONFIRMED_PRESENT", "MENTIONED_ONLY", "PARTICIPATION_UNKNOWN"] as const;
export const participation = z.enum(PARTICIPATION);

export const stakeholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  side: z.enum(["seller", "buyer"]),
  status: participation,
  /** Exact transcript evidence for this person (verified in code). */
  evidence: evidenceSchema,
  /** Speaker label of the line that mentioned them (derived in code from the evidence line). */
  mentionedBy: z.string().nullable(),
  /** Why the status is what it is, e.g. "Spoke on the call as 'Rohit (Buyer)'". */
  basis: z.string(),
});

export const RELATIONSHIP_TYPES = ["APPROVES", "REPORTS_TO", "MUST_CONSULT", "WORKS_WITH"] as const;
export const relationshipSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(RELATIONSHIP_TYPES),
  evidence: evidenceSchema,
});

export const findingValue = z.enum(["yes", "no", "unclear"]);
export const findingSchema = z.object({
  value: findingValue,
  quote: z.string(),
  /** false when the quote could not be found; scoring then treats the finding as "unclear". */
  verified: z.boolean(),
  line: z.number().int().nullable(),
});

/**
 * Yes / no / unclear facts the model reports, each with an exact transcript quote.
 * Grouped by who they describe; the scoring rubric (scoring-rubric.ts) decides what they are worth.
 */
export const FINDING_KEYS = [
  // Buyer side: is the deal moving?
  "buyer_problem_confirmed",
  "buying_signal",
  "buyer_commitment",
  "next_step_agreed",
  "decision_maker_required",
  "decision_maker_engaged",
  "budget_or_timeline_discussed",
  "buyer_rejected",
  "competitor_mentioned",
  // Seller side: how well did the salesperson run the call?
  "discovery_questions_asked",
  "value_linked_to_need",
  "buyer_questions_answered",
  "competitor_addressed",
  "unsupported_claims_made",
  "seller_asked_for_next_step",
] as const;

export const findingsSchema = z.object(
  Object.fromEntries(FINDING_KEYS.map((k) => [k, findingSchema])) as Record<(typeof FINDING_KEYS)[number], typeof findingSchema>,
);

/**
 * Values that need a verified quote to count. Anything else ("no" for most findings) usually
 * describes something that never happened, which has nothing to quote.
 * buyer_questions_answered = "no" is an event (a dodge), so it needs the evasive reply as evidence.
 */
export const QUOTE_REQUIRED: Record<(typeof FINDING_KEYS)[number], readonly ("yes" | "no")[]> = {
  buyer_problem_confirmed: ["yes"],
  buying_signal: ["yes"],
  buyer_commitment: ["yes"],
  next_step_agreed: ["yes"],
  decision_maker_required: ["yes"],
  decision_maker_engaged: ["yes"],
  budget_or_timeline_discussed: ["yes"],
  buyer_rejected: ["yes"],
  competitor_mentioned: ["yes"],
  discovery_questions_asked: ["yes"],
  value_linked_to_need: ["yes"],
  buyer_questions_answered: ["yes", "no"],
  competitor_addressed: ["yes"],
  unsupported_claims_made: ["yes"],
  seller_asked_for_next_step: ["yes"],
};

/** Sales stage of the call. Changes rubric weights; UNKNOWN uses the EVALUATION weights. */
export const SALES_STAGES = ["DISCOVERY", "EVALUATION", "NEGOTIATION", "UNKNOWN"] as const;
export type SalesStage = (typeof SALES_STAGES)[number];

export const salesStageSchema = z.object({
  stage: z.enum(SALES_STAGES),
  /** Verified quote that shows the stage, or null (stage then falls back to UNKNOWN). */
  evidence: evidenceSchema.nullable(),
});

export const analysisSchema = z.object({
  source: z.enum(["sarvam", "sample"]),
  model: z.string().nullable(),
  generatedAt: z.string(),
  dealName: z.string(),
  dealValue: z.string(),
  buyerProblem: z.string(),
  callSummary: z.string(),
  objections: z.array(objectionSchema),
  illusions: z.array(illusionSchema),
  realityCheck: z.array(realityItemSchema),
  stakeholders: z.array(stakeholderSchema),
  relationships: z.array(relationshipSchema),
  findings: findingsSchema,
  salesStage: salesStageSchema,
  /** Speaker turns in the transcript (counted in code). Short calls cannot prove that something never happened. */
  speakerTurns: z.number().int(),
  /** Notes from the code checks, e.g. "2 quotes could not be verified". */
  notices: z.array(z.string()),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type Objection = z.infer<typeof objectionSchema>;
export type ObjectionStatus = z.infer<typeof objectionStatus>;
export type ObjectionCategory = z.infer<typeof objectionCategory>;
export type Illusion = z.infer<typeof illusionSchema>;
export type RealityItem = z.infer<typeof realityItemSchema>;
export type RealityVerdict = z.infer<typeof realityVerdict>;
export type Stakeholder = z.infer<typeof stakeholderSchema>;
export type Participation = z.infer<typeof participation>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Findings = z.infer<typeof findingsSchema>;
export type FindingKey = keyof Findings;
export type Analysis = z.infer<typeof analysisSchema>;

export const UNRESOLVED_STATUSES: ObjectionStatus[] = ["POSSIBLY_UNRESOLVED", "UNANSWERED_OR_AVOIDED", "UNKNOWN"];

/* ---------- Scoring ---------- */

export type ScoreId = "deal" | "seller" | "illusion";

/**
 * What a criterion concluded.
 *  scored         – judged from evidence; `value` 0 (worst) … 1 (best for this score's direction).
 *  insufficient   – could not be judged (unclear / unverified / too little conversation). Not counted.
 *  not_applicable – does not apply to this call or stage (e.g. no competitor mentioned). Not counted.
 */
export type CriterionOutcome = "scored" | "insufficient" | "not_applicable";

export interface CriterionResult {
  id: string;
  label: string;
  /** Weight at this call's stage (0 = not used at this stage). */
  weight: number;
  outcome: CriterionOutcome;
  /** 0–1 when scored, else null. For the Illusion score 1 = maximum risk. */
  value: number | null;
  /** Points contributed to the score (0–100 scale). 0 when not scored. */
  earned: number;
  /** Points this criterion could contribute (its share of the judged weight). 0 when not scored. */
  possible: number;
  /** Verified transcript evidence behind the outcome. Empty only when `basedOnAbsence`. */
  evidence: { quote: string; line: number | null }[];
  /** true when the outcome rests on something never happening across a long enough call. */
  basedOnAbsence: boolean;
  /** Plain-language reason for the outcome. */
  note: string;
  rationale: string;
  /** Concrete next step when the criterion was not fully met. */
  recommendation: string;
  recoveryAction: string;
}

export interface ScoreCap {
  ruleId: string;
  label: string;
  max: number;
  quote: string;
  line: number | null;
  recoveryAction: string;
  recommendation: string;
}

export interface ScoreCard {
  id: ScoreId;
  title: string;
  /** 0–100, or null when too little could be judged (see `status`). */
  score: number | null;
  /** Score before any cap was applied. */
  uncapped: number | null;
  status: "SCORED" | "INSUFFICIENT_EVIDENCE";
  band: string;
  bandTone: "red" | "amber" | "green" | "neutral";
  /** Share of this stage's total weight that could be judged (0–1). */
  coverage: number;
  criteria: CriterionResult[];
  cap: ScoreCap | null;
  /** For Illusion of Agreement Risk, higher = worse; for the others higher = better. */
  higherIsBetter: boolean;
}

export interface ScoreSet {
  stage: SalesStage;
  /** Stage whose weights were used (UNKNOWN → EVALUATION). */
  weightsFrom: Exclude<SalesStage, "UNKNOWN">;
  deal: ScoreCard;
  seller: ScoreCard;
  illusion: ScoreCard;
}

/* ---------- Navigation ---------- */

export type SectionId =
  | "input"
  | "intelligence"
  | "health"
  | "stakeholders"
  | "simulator"
  | "practice"
  | "action-plan"
  | "cfo-memo";
