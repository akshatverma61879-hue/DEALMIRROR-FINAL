import { NextResponse } from "next/server";
import { turnRequestSchema } from "@/lib/practice/types";
import { buyerTurn } from "@/lib/ai/practice";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited, readJson } from "@/lib/ai/http";

export const maxDuration = 60;

/** POST /api/practice/turn — next fictional-buyer message. Strict schema: private rules are rejected. */
export async function POST(req: Request) {
  if (rateLimited(req, "practice", 40)) return fail("RATE_LIMITED");
  const { body, error } = await readJson(req, BODY_LIMITS.practiceTurn);
  if (error) return error;
  const parsed = turnRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_INPUT", "Invalid practice turn.");
  const { context, persona, history } = parsed.data;
  if (history[history.length - 1].role !== "seller") return fail("BAD_INPUT", "Waiting for the salesperson's reply.");
  const started = Date.now();
  try {
    const result = await buyerTurn(context, persona, history);
    logEvent({ event: "practice_turn", turns: history.length, ok: true, ms: Date.now() - started });
    return NextResponse.json(result);
  } catch (e) {
    const code = errorCode(e);
    logEvent({ event: "practice_turn", ok: false, code, ms: Date.now() - started });
    return fail(code);
  }
}
