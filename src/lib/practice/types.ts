import { z } from "zod";
import { LANGUAGES, objectionCategory, productFactsSchema, privateRulesSchema } from "../types";
import { BUYER_TONES } from "./tone";

/* ---------- Context sent to the practice endpoints (never contains private rules unless noted) ---------- */

export const practiceObjectionSchema = z.object({
  id: z.string().max(80),
  category: objectionCategory,
  title: z.string().max(200),
  buyerConcern: z.string().max(1000),
  sellerResponse: z.string().max(1000),
  explanation: z.string().max(1000),
});

export const practiceContextSchema = z.object({
  language: z.enum(LANGUAGES),
  objection: practiceObjectionSchema,
  callSummary: z.string().max(2000),
  buyerProblem: z.string().max(1000),
  /** Names from the real transcript: used only so the fictional persona never reuses them. */
  realNames: z.array(z.string().max(80)).max(20),
  productFacts: productFactsSchema,
});
export type PracticeContext = z.infer<typeof practiceContextSchema>;

export const personaSchema = z.object({
  name: z.string(),
  role: z.string(),
  businessConcerns: z.array(z.object({ text: z.string(), source: z.enum(["TRANSCRIPT", "SIMULATED"]) })),
  negotiationStyle: z.string(),
  objectionSummary: z.string(),
});
export type Persona = z.infer<typeof personaSchema>;

export const BUYER_STANCES = ["SCEPTICAL", "PROBING", "SOFTENING", "READY_FOR_NEXT_STEP"] as const;
export type BuyerStance = (typeof BUYER_STANCES)[number];

export const practiceMessageSchema = z.object({
  id: z.string().max(40),
  role: z.enum(["buyer", "seller"]),
  text: z.string().max(2000),
  stance: z.enum(BUYER_STANCES).optional(),
  /** How the buyer's line is voiced (frustrated, warm…), chosen per turn. */
  tone: z.enum(BUYER_TONES).optional(),
});
export type PracticeMessage = z.infer<typeof practiceMessageSchema> & {
  /** Code-level rule flags on seller messages (client-side, private). */
  flags?: string[];
  /** Seller answer came from the microphone. */
  viaMic?: boolean;
};

/* ---------- Request bodies ---------- */

export const startRequestSchema = practiceContextSchema.strict();

export const turnRequestSchema = z
  .object({
    context: practiceContextSchema,
    persona: personaSchema,
    history: z.array(practiceMessageSchema).min(1).max(30),
  })
  .strict();

/** The coach (not the buyer) may see private rules, to check compliance. */
export const evaluateRequestSchema = z
  .object({
    context: practiceContextSchema,
    persona: personaSchema,
    history: z.array(practiceMessageSchema).min(2).max(30),
    privateRules: privateRulesSchema,
    transcript: z.string().max(30_000),
  })
  .strict();

/** TTS gets only the words to speak. Strict: nothing else (no rules) can be sent. */
export const ttsRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(800),
    language: z.enum(LANGUAGES),
    tone: z.enum(BUYER_TONES).optional(),
  })
  .strict();

/* ---------- Scorecard ---------- */

export const PRACTICE_DIMENSIONS = [
  "UNDERSTANDING",
  "OBJECTION_HANDLING",
  "PRODUCT_ACCURACY",
  "VALUE_COMMUNICATION",
  "PROFESSIONALISM",
  "RULE_COMPLIANCE",
  "FOLLOW_UP",
] as const;
export type PracticeDimension = (typeof PRACTICE_DIMENSIONS)[number];

export interface DimensionScore {
  id: PracticeDimension;
  label: string;
  weight: number;
  score: number; // 0–10 after code checks
  aiScore: number; // 0–10 as returned by the model
  reason: string;
  evidence: { quote: string; verified: boolean } | null;
  cappedBy: string | null;
}

export interface Scorecard {
  overall: number; // 0–100, weighted in code
  dimensions: DimensionScore[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  strongerResponse: { text: string; warnings: string[]; withheld: boolean };
  ruleViolations: string[];
  model: string;
}
