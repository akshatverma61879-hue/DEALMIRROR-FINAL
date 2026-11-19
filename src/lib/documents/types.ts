/**
 * BUYER-DOCUMENT DATA ISOLATION
 * The document endpoint accepts ONLY this schema. Every object is strict, so a request that carries
 * private sales rules, the salesperson's impression, marketing claims or the deal score is rejected
 * by code, not by an AI instruction.
 */
import { z } from "zod";
import { LANGUAGES, objectionCategory, objectionStatus, participation } from "../types";

const s = (max: number) => z.string().max(max);

/** Public, verified product facts only. `marketingClaims` is deliberately absent. */
export const verifiedFactsSchema = z.strictObject({
  companyName: s(200),
  productName: s(200),
  productDescription: s(1500),
  productPrice: s(200),
  productFeatures: s(600),
  targetCustomers: s(600),
  competitors: s(200),
  competitorPricing: s(600),
  verifiedBenefits: s(1500),
  availableOffers: s(600),
});
export type VerifiedFacts = z.infer<typeof verifiedFactsSchema>;

export const buyerDocumentInputSchema = z.strictObject({
  language: z.enum(LANGUAGES),
  dealName: s(200),
  callSummary: s(2000),
  buyerProblem: s(1000),
  transcript: s(30_000).min(1),
  objections: z
    .array(z.strictObject({ title: s(200), category: objectionCategory, status: objectionStatus, buyerConcern: s(1000) }))
    .max(12),
  stakeholders: z
    .array(z.strictObject({ name: s(80), role: s(120), side: z.enum(["seller", "buyer"]), status: participation }))
    .max(12),
  facts: verifiedFactsSchema,
});
export type BuyerDocumentInput = z.infer<typeof buyerDocumentInputSchema>;

/* ---------- Generated documents ---------- */

export const ACTION_STATUSES = ["AGREED", "PROPOSED", "COMPLETED", "UNKNOWN"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export interface DocEvidence {
  quote: string;
  verified: boolean;
  line: number | null;
}

export interface PlanItem {
  id: string;
  task: string;
  owner: string; // "Unassigned" when unknown
  status: ActionStatus;
  due: string; // "TBD" unless the transcript states a date
  evidence: DocEvidence | null;
  justification: string;
  source: "AI" | "TEMPLATE" | "USER";
  edited: boolean;
}

export interface Decision {
  text: string;
  evidence: DocEvidence;
}

export interface BuyerPlan {
  title: string;
  meetingSummary: string;
  decisions: Decision[];
  openQuestions: string[];
  items: PlanItem[];
}

export const MEMO_KEYS = [
  "businessContext",
  "problem",
  "proposedSolution",
  "capabilities",
  "benefits",
  "pricing",
  "risks",
  "nextSteps",
] as const;
export type MemoKey = (typeof MEMO_KEYS)[number];

export const MEMO_HEADINGS: Record<MemoKey, string> = {
  businessContext: "1. Business context",
  problem: "2. Problem being addressed",
  proposedSolution: "3. Proposed solution",
  capabilities: "4. Verified product capabilities",
  benefits: "5. Documented business benefits",
  pricing: "6. Pricing information",
  risks: "7. Risks and outstanding questions",
  nextSteps: "8. Recommended next steps",
};

export interface MemoSection {
  key: MemoKey;
  heading: string;
  body: string; // lines starting with "• " render as bullets
  /** Where the content came from: built from verified facts in code, AI draft, or the user. */
  origin: "FACTS" | "AI" | "TEMPLATE" | "USER";
}

export interface CfoMemo {
  subject: string;
  to: string;
  sections: MemoSection[];
}

export interface GeneratedDocuments {
  plan: BuyerPlan;
  memo: CfoMemo;
  generatedBy: "sarvam" | "template" | "sample";
  model: string | null;
  notices: string[];
}
