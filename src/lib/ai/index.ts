/**
 * AI service layer (server only).
 *  - The transcript is DATA, never instructions (see prompt-safety.ts).
 *  - The model only extracts findings + quotes; the score is calculated in src/lib/scoring.ts.
 *  - Every response is validated with Zod and every quote is checked against the transcript.
 */
import "server-only";
import type { Analysis, ValidDealInput } from "../types";
import { AiError, aiConfig, generateJson } from "./sarvam";
import { modelOutputJsonSchema, modelOutputSchema } from "./schema";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "./prompts";
import { normalizeAnalysis } from "./normalize";
import { repairModelOutput } from "./repair";

export { AiError } from "./sarvam";

function parseModelJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false as const, reason: "not JSON" };
  }
  const parsed = modelOutputSchema.safeParse(repairModelOutput(json));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false as const, reason: `schema mismatch at ${first?.path.join(".") || "root"}: ${first?.message ?? ""}` };
  }
  // Repair fills missing fields with defaults, so a near-empty reply can still pass the schema.
  // Every real call has a summary: without one, treat the reply as invalid and retry.
  if (!parsed.data.callSummary.trim()) return { ok: false as const, reason: "empty analysis (no callSummary)" };
  return { ok: true as const, data: parsed.data };
}

export async function analyseTranscript(input: ValidDealInput): Promise<Analysis> {
  const user = buildAnalysisUserPrompt(input);
  const jsonSchema = modelOutputJsonSchema();

  // One retry on invalid JSON / schema mismatch; other errors are thrown straight away.
  let lastReason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateJson({
      system: ANALYSIS_SYSTEM_PROMPT,
      user: attempt === 0 ? user : `${user}\n\nYour previous reply was invalid (${lastReason}). Return ONLY valid JSON matching the schema.`,
      jsonSchema,
    });
    const result = parseModelJson(text);
    if (result.ok) return normalizeAnalysis(result.data, input, aiConfig().model);
    lastReason = result.reason;
    // Metadata only (never the transcript), so the real cause shows up in the server log.
    console.info(JSON.stringify({ event: "analyze_invalid_output", attempt: attempt + 1, reason: lastReason, chars: text.length }));
  }
  throw new AiError("INVALID_JSON", `Sarvam's answer did not match the expected format (${lastReason}).`);
}
