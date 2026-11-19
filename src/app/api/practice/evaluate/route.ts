import { NextResponse } from "next/server";
import { evaluateRequestSchema } from "@/lib/practice/types";
import { evaluatePractice } from "@/lib/ai/practice";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited, readJson } from "@/lib/ai/http";

export const maxDuration = 60;

/** POST /api/practice/evaluate — coaching scorecard. The coach (not the buyer) checks private-rule compliance. */
export async function POST(req: Request) {
  if (rateLimited(req, "practice", 40)) return fail("RATE_LIMITED");
  const { body, error } = await readJson(req, BODY_LIMITS.practiceEvaluate);
  if (error) return error;
  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_INPUT", "Practise at least one reply before ending.");
  const { context, persona, history, privateRules, transcript } = parsed.data;
  if (!history.some((m) => m.role === "seller")) return fail("BAD_INPUT", "Practise at least one reply before ending.");
  const started = Date.now();
  try {
    const scorecard = await evaluatePractice(context, persona, history, privateRules, transcript);
    logEvent({ event: "practice_evaluate", turns: history.length, ok: true, overall: scorecard.overall, ms: Date.now() - started });
    return NextResponse.json({ scorecard });
  } catch (e) {
    const code = errorCode(e);
    logEvent({ event: "practice_evaluate", ok: false, code, ms: Date.now() - started });
    return fail(code);
  }
}
