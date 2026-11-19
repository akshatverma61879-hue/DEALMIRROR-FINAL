/**
 * Emotional tone of the fictional buyer's voice, chosen per turn from the conversation.
 * Shared by the server (provider voice settings) and the browser (speech synthesis fallback).
 * Tone changes HOW a line is spoken; the words themselves are also written to carry the tone.
 */
import type { BuyerStance } from "./types";

export const BUYER_TONES = ["FRUSTRATED", "SCEPTICAL", "CURIOUS", "NEUTRAL", "WARM", "ENTHUSIASTIC"] as const;
export type BuyerTone = (typeof BUYER_TONES)[number];

export const TONE_META: Record<BuyerTone, { label: string; variant: "red" | "amber" | "teal" | "green" | "neutral"; when: string }> = {
  FRUSTRATED: { label: "Frustrated", variant: "red", when: "the salesperson dodged a question again, repeated a weak answer, or pushed without listening" },
  SCEPTICAL: { label: "Sceptical", variant: "amber", when: "you doubt a claim or the answer was vague" },
  CURIOUS: { label: "Curious", variant: "teal", when: "the salesperson raised something relevant or asked a good question" },
  NEUTRAL: { label: "Neutral", variant: "neutral", when: "a plain, factual exchange" },
  WARM: { label: "Warming up", variant: "green", when: "your concern was addressed well" },
  ENTHUSIASTIC: { label: "Enthusiastic", variant: "green", when: "you are genuinely ready to agree a concrete next step" },
};

/**
 * Voice settings per tone.
 *  pace / loudness / expressiveness → Sarvam Bulbul (pace 0.5–2, loudness ~0.5–2, temperature 0–1).
 *  rate / pitch / volume → browser SpeechSynthesis (rate 0.1–10, pitch 0–2, volume 0–1).
 * Kept close to neutral so the voice still sounds like the same person.
 */
export interface VoiceStyle {
  pace: number;
  loudness: number;
  expressiveness: number;
  rate: number;
  pitch: number;
  volume: number;
}

export const VOICE_STYLE: Record<BuyerTone, VoiceStyle> = {
  FRUSTRATED: { pace: 1.12, loudness: 1.2, expressiveness: 0.85, rate: 1.12, pitch: 0.9, volume: 1 },
  SCEPTICAL: { pace: 0.94, loudness: 1.0, expressiveness: 0.65, rate: 0.94, pitch: 0.95, volume: 1 },
  CURIOUS: { pace: 1.04, loudness: 1.0, expressiveness: 0.7, rate: 1.03, pitch: 1.08, volume: 1 },
  NEUTRAL: { pace: 1.0, loudness: 1.0, expressiveness: 0.6, rate: 1.0, pitch: 1.0, volume: 1 },
  WARM: { pace: 0.95, loudness: 0.95, expressiveness: 0.7, rate: 0.96, pitch: 1.05, volume: 0.95 },
  ENTHUSIASTIC: { pace: 1.08, loudness: 1.15, expressiveness: 0.85, rate: 1.08, pitch: 1.12, volume: 1 },
};

/** Tones that fit each stance. A mismatch (e.g. ENTHUSIASTIC while SCEPTICAL) falls back to the default. */
const ALLOWED: Record<BuyerStance, readonly BuyerTone[]> = {
  SCEPTICAL: ["SCEPTICAL", "FRUSTRATED", "NEUTRAL"],
  PROBING: ["SCEPTICAL", "CURIOUS", "NEUTRAL", "FRUSTRATED"],
  SOFTENING: ["WARM", "CURIOUS", "NEUTRAL"],
  READY_FOR_NEXT_STEP: ["WARM", "ENTHUSIASTIC"],
};

const DEFAULT_FOR: Record<BuyerStance, BuyerTone> = {
  SCEPTICAL: "SCEPTICAL",
  PROBING: "CURIOUS",
  SOFTENING: "WARM",
  READY_FOR_NEXT_STEP: "WARM",
};

export function toneFromStance(stance: BuyerStance | undefined): BuyerTone {
  return stance ? DEFAULT_FOR[stance] : "NEUTRAL";
}

/** The model's tone if it fits the stance, otherwise the stance's default. */
export function resolveTone(tone: BuyerTone | undefined, stance: BuyerStance): BuyerTone {
  return tone && ALLOWED[stance].includes(tone) ? tone : DEFAULT_FOR[stance];
}

const clampTo = (min: number, max: number, n: number) => Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;

/**
 * Sarvam Bulbul settings for a tone. `basePace` (SARVAM_TTS_PACE) sets the base speed; the tone adjusts it.
 * Ranges checked against the API: pace 0.5–2, loudness 0.5–2, temperature ≤ 1.
 */
export function sarvamVoiceSettings(tone: BuyerTone, basePace?: number) {
  const style = VOICE_STYLE[tone];
  const base = basePace !== undefined && basePace >= 0.5 && basePace <= 2 ? basePace : 1;
  return {
    pace: clampTo(0.5, 2, base * style.pace),
    loudness: clampTo(0.5, 2, style.loudness),
    temperature: clampTo(0.01, 1, style.expressiveness),
  };
}

/** Removes what a voice engine would read out literally: stage directions, markdown, emojis. */
export function speakable(text: string): string {
  return text
    .replace(/\([^)]{0,40}\)|\[[^\]]{0,40}\]/g, " ") // stage directions: (sighs), [pause]
    .replace(/[*#_`]/g, "") // markdown emphasis marks; the emphasised words stay
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+([,.!?।])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
