import { NextResponse } from "next/server";
import { STT_LANGUAGES, sttProvider, transcribe, type SttLanguage } from "@/lib/ai/stt";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited } from "@/lib/ai/http";

export const maxDuration = 45;

/** GET /api/stt — which server speech-to-text provider is configured (no secrets). */
export async function GET() {
  return NextResponse.json({ provider: sttProvider() });
}

/**
 * POST /api/stt — transcribes ONE short recorded answer (multipart: file, language).
 * The client falls back to browser speech recognition on any error.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "stt", 30)) return fail("RATE_LIMITED");
  if (Number(req.headers.get("content-length") ?? "0") > BODY_LIMITS.stt) return fail("TOO_LARGE");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_INPUT", "Invalid voice upload.");
  }
  const file = form.get("file");
  const language = String(form.get("language") ?? "");
  if (!(file instanceof Blob) || file.size === 0) return fail("BAD_INPUT", "No audio was received.");
  if (file.size > BODY_LIMITS.stt) return fail("TOO_LARGE", "The recording is too long. Keep answers under 30 seconds.");
  if (!(STT_LANGUAGES as readonly string[]).includes(language)) return fail("BAD_INPUT", "Unsupported language.");

  const started = Date.now();
  try {
    const name = file instanceof File && file.name ? file.name : "answer.webm";
    const text = await transcribe(file, name, language as SttLanguage);
    logEvent({ event: "stt", provider: "sarvam", language, bytes: file.size, chars: text.length, ms: Date.now() - started });
    return NextResponse.json({ text });
  } catch (e) {
    const code = errorCode(e);
    logEvent({ event: "stt", ok: false, code, ms: Date.now() - started });
    return fail(code, undefined, {
      NOT_CONFIGURED: "No server speech-to-text is configured.",
      QUOTA_EXCEEDED: "The speech-to-text quota was reached.",
      INVALID_KEY: "The speech-to-text key was rejected.",
      TIMEOUT: "Speech-to-text took too long.",
      MODEL_ERROR: "Speech-to-text returned an error.",
      NETWORK: "Speech-to-text could not be reached.",
    });
  }
}
