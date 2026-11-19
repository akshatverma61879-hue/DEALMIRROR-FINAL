/**
 * The raw JSON shape the model is asked to return. Validated with Zod before anything is shown.
 * Missing quotes are empty strings (not null) to keep the JSON Schema simple for the model.
 */
import { z } from "zod";
import {
  SALES_STAGES,
  OBJECTION_CATEGORIES,
  OBJECTION_STATUSES,
  REALITY_VERDICTS,
  FINDING_KEYS,
  PARTICIPATION,
  RELATIONSHIP_TYPES,
} from "../types";

const str = (description: string) => z.string().describe(description);
const quote = (description: string) =>
  z.string().describe(`${description} Copy it EXACTLY, character for character, from the transcript, without the speaker label. Empty string if none.`);
const level = z.enum(["high", "medium", "low"]);

const modelFinding = z.object({
  value: z.enum(["yes", "no", "unclear"]),
  quote: quote("Shortest exact transcript line that supports the value."),
});

export const modelOutputSchema = z.object({
  dealName: str("Buyer company or deal name if stated in the transcript or facts, otherwise empty string."),
  callSummary: str("2-3 neutral sentences summarising the call."),
  buyerProblem: str("The buyer's problem in their own terms, only if stated. Empty string if not stated."),
  objections: z
    .array(
      z.object({
        id: str("Short unique id like obj-1."),
        category: z.enum(OBJECTION_CATEGORIES),
        title: str("3-6 word label for the concern."),
        buyerConcernQuote: quote("The buyer's words raising the concern."),
        sellerResponseQuote: quote("The seller's direct response."),
        buyerFollowUpQuote: quote("What the buyer said next."),
        explanation: str("One or two sentences: why this status, based only on the transcript."),
        status: z.enum(OBJECTION_STATUSES),
        confidence: level,
        isInferred: z.boolean().describe("true if the concern is implied rather than stated."),
        suggestedResponse: str("For unresolved objections: a practical next response the seller can say, in the transcript language. Empty for resolved ones."),
        suggestedResponseBasedOn: z.array(z.string()).describe("Which provided facts the suggestion uses, e.g. 'Verified benefit: ...'. Empty if none."),
        clarifyingQuestion: str("A question to ask when important information is missing. Empty string if not needed."),
      }),
    )
    .max(12),
  illusions: z
    .array(
      z.object({
        id: str("Short unique id like ill-1."),
        objectionId: str("id of the related objection, or empty string."),
        politePhraseQuote: quote("The polite buyer phrase that could be mistaken for agreement."),
        buyerConcernQuote: quote("The concern that was raised before it."),
        sellerResponseQuote: quote("The seller's response to that concern."),
        buyerFollowUpQuote: quote("The buyer's follow-up."),
        addressed: str("What the salesperson actually addressed."),
        unconfirmed: str("What remains unconfirmed."),
        falseConfidence: str("Why this exchange could create false confidence. Do not claim to know the buyer's thoughts."),
        clarificationToSeek: str("The clarification the salesperson should seek."),
        uncertainty: level,
      }),
    )
    .max(8),
  realityCheck: z
    .array(
      z.object({
        claim: str("A claim copied EXACTLY from the salesperson's impression. Never invent a claim."),
        evidenceQuote: quote("Transcript line most relevant to the claim."),
        verdict: z.enum(REALITY_VERDICTS),
        explanation: str("One sentence explaining the verdict."),
      }),
    )
    .max(10),
  stakeholders: z
    .array(
      z.object({
        name: str("Name or role exactly as used in the transcript, e.g. 'Meera' or 'CFO'. Never invent people."),
        role: str("Role if stated in the transcript, otherwise 'Role not stated'."),
        side: z.enum(["seller", "buyer"]),
        status: z.enum(PARTICIPATION),
        quote: quote("Line where they speak or are mentioned."),
      }),
    )
    .max(12),
  relationships: z
    .array(
      z.object({
        from: str("Stakeholder name (as in the stakeholders list)."),
        to: str("Stakeholder name (as in the stakeholders list)."),
        type: z.enum(RELATIONSHIP_TYPES).describe("APPROVES: from approves for to. REPORTS_TO, MUST_CONSULT, WORKS_WITH."),
        quote: quote("The line that states this relationship. Only include relationships the transcript states."),
      }),
    )
    .max(12),
  salesStage: z.object({
    stage: z
      .enum(SALES_STAGES)
      .describe("DISCOVERY: early call, learning the buyer's needs. EVALUATION: solution, demo, pilot or fit being assessed. NEGOTIATION: pricing, terms, approvals or contract. UNKNOWN if unclear."),
    quote: quote("The line that best shows the stage."),
  }),
  findings: z.object(
    Object.fromEntries(FINDING_KEYS.map((k) => [k, modelFinding])) as Record<
      (typeof FINDING_KEYS)[number],
      typeof modelFinding
    >,
  ),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** JSON Schema sent to Sarvam inside the system prompt (see generateJson in sarvam.ts). */
export function modelOutputJsonSchema() {
  const schema = z.toJSONSchema(modelOutputSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
