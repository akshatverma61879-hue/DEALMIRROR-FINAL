/**
 * Server-side speech-to-text for the salesperson's spoken answers in practice mode (Sarvam Saaras).
 * Only the recorded audio clip and a language hint are sent. The browser's built-in speech
 * recognition is the client-side fallback when this is not configured or fails.
 */
import "server-only";
import { AiError, aiConfig, classify, sarvamHeaders, type SarvamError } from "./sarvam";

export const STT_LANGUAGES = ["en-IN", "hi-IN"] as const;
export type SttLanguage = (typeof STT_LANGUAGES)[number];

export function sttProvider(): "sarvam" | "none" {
  const p = (process.env.STT_PROVIDER || "").toLowerCase();
  if (p === "none" || p === "browser") return "none";
  return process.env.SARVAM_API_KEY?.trim() ? "sarvam" : "none";
}

export async function transcribe(audio: Blob, filename: string, language: SttLanguage): Promise<string> {
  if (sttProvider() === "none") throw new AiError("NOT_CONFIGURED", "No server speech-to-text is configured.");
  const { apiKey, baseUrl } = aiConfig();
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", process.env.SARVAM_STT_MODEL || "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", language);

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl}/speech-to-text`, {
      method: "POST",
      headers: sarvamHeaders(apiKey),
      body: form,
      signal: c.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as SarvamError & { transcript?: string };
    if (!res.ok) throw classify(res.status, data, "Sarvam speech-to-text");
    return (data.transcript ?? "").trim();
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (c.signal.aborted) throw new AiError("TIMEOUT", "Speech-to-text did not respond in time.");
    throw new AiError("NETWORK", "Could not reach the speech-to-text service.");
  } finally {
    clearTimeout(t);
  }
}
