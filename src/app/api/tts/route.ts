import { NextResponse } from "next/server";
import { ttsRequestSchema } from "@/lib/practice/types";
import { synthesize, ttsProvider } from "@/lib/ai/tts";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited, readJson } from "@/lib/ai/http";

export const maxDuration = 45;

/** GET /api/tts — which server voice provider is configured (no secrets). */
export async function GET() {
  return NextResponse.json({ provider: ttsProvider() });
}

/**
 * POST /api/tts — speaks ONE fictional-buyer message. Strict schema: only { text, language, tone? }.
 * Returns audio bytes; the client falls back to browser speech on any error.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "tts", 60)) return fail("RATE_LIMITED");
  const { body, error } = await readJson(req, BODY_LIMITS.tts);
  if (error) return error;
  const parsed = ttsRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_INPUT", "Invalid voice request.");
  const started = Date.now();
  try {
    const { audio, mime, provider } = await synthesize(parsed.data.text, parsed.data.language, parsed.data.tone);
    logEvent({ event: "tts", provider, language: parsed.data.language, tone: parsed.data.tone ?? "NEUTRAL", chars: parsed.data.text.length, bytes: audio.length, ms: Date.now() - started });
    return new NextResponse(new Uint8Array(audio), {
      headers: { "content-type": mime, "x-voice-provider": provider, "cache-control": "no-store" },
    });
  } catch (e) {
    const code = errorCode(e);
    logEvent({ event: "tts", ok: false, code, ms: Date.now() - started });
    return fail(code, undefined, {
      NOT_CONFIGURED: "No server voice is configured.",
      QUOTA_EXCEEDED: "The voice service quota was reached.",
      INVALID_KEY: "The voice service key was rejected.",
      TIMEOUT: "The voice service took too long.",
      MODEL_ERROR: "The voice service returned an error.",
      NETWORK: "The voice service could not be reached.",
    });
  }
}
