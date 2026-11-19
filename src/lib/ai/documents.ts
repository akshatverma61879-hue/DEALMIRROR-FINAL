/**
 * Buyer-document generation (server only). Receives ONLY BuyerDocumentInput (strict schema).
 * The AI drafts; code decides statuses, dates, owners, fact sections and removes unsupported claims.
 */
import "server-only";
import { z } from "zod";
import { AiError, aiConfig, generateJson } from "./sarvam";
import { UNTRUSTED_DATA_RULES, wrapUntrusted } from "./prompt-safety";
import { ACTION_STATUSES, type BuyerDocumentInput, type GeneratedDocuments } from "../documents/types";
import { buildMemo, factsText, reviewDecisions, reviewPlanItems } from "../documents/review";

const docsOut = z.object({
  title: z.string().describe("Short title, e.g. 'Nova Retail × SalesPro · Mutual action plan'."),
  meetingSummary: z.string().describe("3-4 neutral sentences a buyer would agree with. No internal assessment."),
  confirmedDecisions: z
    .array(z.object({ text: z.string(), evidenceQuote: z.string().describe("Exact transcript words showing the decision. Empty if none.") }))
    .max(8),
  openQuestions: z.array(z.string()).max(8).describe("Questions still open for either side, phrased neutrally."),
  actionItems: z
    .array(
      z.object({
        task: z.string(),
        owner: z.string().describe("Name or company from the transcript. Empty string if not stated."),
        status: z.enum(ACTION_STATUSES).describe("AGREED only if the transcript shows both sides agreed; COMPLETED only if the transcript shows it is done; PROPOSED for your recommendations; UNKNOWN otherwise."),
        dueDate: z.string().describe("Date/time exactly as stated in the transcript. Empty string if no date was stated. Never invent dates."),
        evidenceQuote: z.string().describe("Exact transcript words supporting AGREED/COMPLETED. Empty for PROPOSED."),
        justification: z.string().describe("One sentence: why this task matters."),
      }),
    )
    .max(12),
  memo: z.object({
    businessContext: z.string().describe("2-3 sentences on the buyer's situation, from the transcript only."),
    problem: z.string().describe("The problem in the buyer's terms, from the transcript only."),
    proposedSolution: z.string().describe("2-3 sentences describing the proposed purchase using only the public facts."),
    risksAndQuestions: z.array(z.string()).max(8),
    nextSteps: z.array(z.string()).max(6),
  }),
});

const SYSTEM = `DOCUMENTS_TASK. You draft two buyer-facing documents after a B2B sales call: a mutual action plan and a one-page CFO justification memo.
${UNTRUSTED_DATA_RULES}
RULES
- Buyer-facing: neutral, professional, factual. No internal assessments, scores, negotiation strategy or pressure language.
- Use only the transcript and the verified public product facts provided. Never invent financial returns, ROI percentages, cost savings, customer testimonials, certifications, guarantees or contractual commitments.
- If ROI or savings are unknown, say that financial benefits require validation.
- Action items: AGREED only when both sides clearly agreed on the call (quote it). COMPLETED only when the transcript shows completion (quote it). Your own recommendations are PROPOSED with no quote. Never invent dates or owners: leave them empty if not stated.
- Write in English.`;

export async function generateDocuments(input: BuyerDocumentInput): Promise<GeneratedDocuments> {
  const jsonSchema = z.toJSONSchema(docsOut, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const user = `${wrapUntrusted("deal", `Deal: ${input.dealName}\nSummary: ${input.callSummary}\nBuyer problem: ${input.buyerProblem}`)}

${wrapUntrusted("open_objections", input.objections.map((o) => `${o.title} (${o.status}): "${o.buyerConcern}"`).join("\n"))}

${wrapUntrusted("people", input.stakeholders.map((s) => `${s.name}, ${s.role}, ${s.side}, ${s.status}`).join("\n"))}

${wrapUntrusted("verified_public_facts", factsText(input.facts))}

${wrapUntrusted("transcript", input.transcript)}

Return the JSON now.`;

  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateJson({ system: SYSTEM, user: attempt ? `${user}\n\nPrevious reply invalid (${reason}). Return ONLY valid JSON.` : user, jsonSchema });
    let parsed;
    try {
      parsed = docsOut.safeParse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")));
    } catch {
      reason = "not JSON";
      continue;
    }
    if (!parsed.success) {
      reason = `schema mismatch at ${parsed.error.issues[0]?.path.join(".")}`;
      continue;
    }
    const out = parsed.data;
    const plan = reviewPlanItems(out.actionItems, input, "AI");
    const decisions = reviewDecisions(out.confirmedDecisions, input);
    const memo = buildMemo(out.memo, input, "AI");
    return {
      plan: {
        title: out.title.trim() || `${input.dealName} · Mutual action plan`,
        meetingSummary: out.meetingSummary.trim(),
        decisions: decisions.decisions,
        openQuestions: out.openQuestions.map((q) => q.trim()).filter(Boolean),
        items: plan.items,
      },
      memo: memo.memo,
      generatedBy: "sarvam",
      model: aiConfig().model,
      notices: [...plan.notices, ...decisions.notices, ...memo.notices],
    };
  }
  throw new AiError("INVALID_JSON", `Sarvam's answer did not match the expected format (${reason}).`);
}
