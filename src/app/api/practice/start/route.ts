import { NextResponse } from "next/server";
import { startRequestSchema } from "@/lib/practice/types";
import { generatePersona } from "@/lib/ai/practice";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited, readJson } from "@/lib/ai/http";

export const maxDuration = 60;

/** POST /api/practice/start — fictional persona + opening buyer message. Never receives private rules. */
export async function POST(req: Request) {
  if (rateLimited(req, "practice", 40)) return fail("RATE_LIMITED");
  const { body, error } = await readJson(req, BODY_LIMITS.practiceStart);
  if (error) return error;
  const parsed = startRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_INPUT", "Invalid practice setup.");
  const started = Date.now();
  try {
    const { persona, opening, openingTone } = await generatePersona(parsed.data);
    logEvent({ event: "practice_start", language: parsed.data.language, ok: true, ms: Date.now() - started });
    return NextResponse.json({ persona, opening, openingTone });
  } catch (e) {
    const code = errorCode(e);
    logEvent({ event: "practice_start", ok: false, code, ms: Date.now() - started });
    return fail(code);
  }
}
