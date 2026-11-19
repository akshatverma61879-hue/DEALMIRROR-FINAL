import { NextResponse } from "next/server";
import { dealInputSchema } from "@/lib/types";
import { analyseTranscript } from "@/lib/ai";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited, readJson } from "@/lib/ai/http";

export const maxDuration = 90;

const MAX_PER_MINUTE = Number(process.env.ANALYZE_RATE_LIMIT) || 8;

/**
 * POST /api/analyze
 * 1 size limit · 2 validate input (Zod) · 3 build prompt · 4 call Sarvam · 5 validate output
 * 6 verify quotes · 7 return normalised analysis. Logs metadata only, never the transcript.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "analyze", MAX_PER_MINUTE)) return fail("RATE_LIMITED");
  const { body, error } = await readJson(req, BODY_LIMITS.analyze);
  if (error) return error;
  const parsed = dealInputSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_INPUT", parsed.error.issues[0]?.message);

  const started = Date.now();
  const meta = { event: "analyze", chars: parsed.data.transcript.length, language: parsed.data.language };
  try {
    const analysis = await analyseTranscript(parsed.data);
    logEvent({ ...meta, ok: true, ms: Date.now() - started, objections: analysis.objections.length });
    return NextResponse.json({ analysis });
  } catch (e) {
    const code = errorCode(e);
    logEvent({ ...meta, ok: false, code, ms: Date.now() - started });
    return fail(code, undefined, {
      NOT_CONFIGURED: "AI analysis is not set up on this server yet (SARVAM_API_KEY is missing).",
      INVALID_KEY: "The Sarvam API key was rejected. Check SARVAM_API_KEY on the server.",
      QUOTA_EXCEEDED: "The Sarvam quota was reached. Wait a minute and try again, or use another key.",
      TIMEOUT: "Sarvam took too long to answer. Try again, or shorten the transcript.",
      INVALID_JSON: "Sarvam's answer was not in the expected format, even after a retry. Please try again.",
    });
  }
}
