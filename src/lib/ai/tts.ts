/**
 * Server-side text-to-speech for the fictional buyer's lines ONLY.
 * Providers (TTS_PROVIDER): "sarvam" (default when SARVAM_API_KEY is set), "elevenlabs", "fish", or "none".
 * Only the buyer's visible words, a language and a tone are ever sent; private rules never reach a voice provider.
 * The browser's built-in speech synthesis is the client-side fallback and needs no server.
 * The tone (frustrated, warm…) adjusts speed, loudness and expressiveness per provider (see practice/tone.ts).
 */
import "server-only";
import { AiError, aiConfig, classify, sarvamHeaders, type SarvamError } from "./sarvam";
import type { Language } from "../types";
import { VOICE_STYLE, sarvamVoiceSettings, type BuyerTone } from "../practice/tone";

export interface SpeechResult {
  audio: Buffer;
  mime: string;
  provider: "sarvam" | "elevenlabs" | "fish";
}

export function ttsProvider(): SpeechResult["provider"] | "none" {
  const p = (process.env.TTS_PROVIDER || "").toLowerCase();
  if (p === "none" || p === "browser") return "none";
  if (p === "elevenlabs") return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "none";
  if (p === "fish") return process.env.FISH_AUDIO_API_KEY ? "fish" : "none";
  return process.env.SARVAM_API_KEY?.trim() ? "sarvam" : "none";
}

/** BCP-47 language for Sarvam. Hinglish is code-mixed Hindi-English, which Bulbul reads with hi-IN. */
export function sarvamLanguage(language: Language): "en-IN" | "hi-IN" {
  return language === "English" ? "en-IN" : "hi-IN";
}

const clampTo = (min: number, max: number, n: number) => Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 30_000): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fn(c.signal);
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (c.signal.aborted) throw new AiError("TIMEOUT", "The voice service did not respond in time.");
    throw new AiError("NETWORK", "Could not reach the voice service.");
  } finally {
    clearTimeout(t);
  }
}

async function sarvam(text: string, language: Language, tone: BuyerTone): Promise<SpeechResult> {
  const { apiKey, baseUrl } = aiConfig();
  return withTimeout(async (signal) => {
    const res = await fetch(`${baseUrl}/text-to-speech`, {
      method: "POST",
      headers: { "content-type": "application/json", ...sarvamHeaders(apiKey) },
      body: JSON.stringify({
        text,
        language_code: sarvamLanguage(language),
        model: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
        speaker: process.env.SARVAM_TTS_SPEAKER || "shubh",
        ...sarvamVoiceSettings(tone, Number(process.env.SARVAM_TTS_PACE) || undefined),
        speech_sample_rate: 24_000,
      }),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as SarvamError & { audios?: string[] };
    if (!res.ok) throw classify(res.status, data, "Sarvam voice");
    const b64 = data.audios?.find((a) => typeof a === "string" && a.length > 0);
    if (!b64) throw new AiError("MODEL_ERROR", "Sarvam returned no audio.");
    return { audio: Buffer.from(b64, "base64"), mime: "audio/wav", provider: "sarvam" };
  });
}

async function elevenlabs(text: string, tone: BuyerTone): Promise<SpeechResult> {
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!voice) throw new AiError("NOT_CONFIGURED", "ELEVENLABS_VOICE_ID is not set.");
  const style = VOICE_STYLE[tone];
  return withTimeout(async (signal) => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        // Lower stability and more style give a more emotional delivery.
        voice_settings: {
          stability: clampTo(0.2, 0.8, 1.15 - style.expressiveness),
          similarity_boost: 0.75,
          style: clampTo(0, 0.7, style.expressiveness - 0.4),
          speed: clampTo(0.7, 1.2, style.pace),
        },
      }),
      signal,
    });
    if (res.status === 401) throw new AiError("INVALID_KEY", "The ElevenLabs API key was rejected.");
    if (res.status === 429) throw new AiError("QUOTA_EXCEEDED", "ElevenLabs quota reached.");
    if (!res.ok) throw new AiError("MODEL_ERROR", `ElevenLabs error (HTTP ${res.status}).`);
    return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg", provider: "elevenlabs" };
  });
}

async function fish(text: string, tone: BuyerTone): Promise<SpeechResult> {
  const style = VOICE_STYLE[tone];
  return withTimeout(async (signal) => {
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
        ...(process.env.FISH_AUDIO_MODEL ? { model: process.env.FISH_AUDIO_MODEL } : {}),
      },
      body: JSON.stringify({
        text,
        format: "mp3",
        prosody: { speed: clampTo(0.5, 2, style.pace), volume: Math.round((style.loudness - 1) * 10) },
        ...(process.env.FISH_AUDIO_VOICE_ID ? { reference_id: process.env.FISH_AUDIO_VOICE_ID } : {}),
      }),
      signal,
    });
    if (res.status === 401 || res.status === 403) throw new AiError("INVALID_KEY", "The Fish Audio API key was rejected.");
    if (res.status === 402 || res.status === 429) throw new AiError("QUOTA_EXCEEDED", "Fish Audio quota or credit reached.");
    if (!res.ok) throw new AiError("MODEL_ERROR", `Fish Audio error (HTTP ${res.status}).`);
    return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg", provider: "fish" };
  });
}

/** Speaks one buyer line in the given tone. */
export async function synthesize(text: string, language: Language, tone: BuyerTone = "NEUTRAL"): Promise<SpeechResult> {
  const provider = ttsProvider();
  if (provider === "none") throw new AiError("NOT_CONFIGURED", "No server voice provider is configured.");
  if (provider === "elevenlabs") return elevenlabs(text, tone);
  if (provider === "fish") return fish(text, tone);
  return sarvam(text, language, tone);
}
