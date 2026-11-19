/** Shared API route helpers: user-facing error messages, rate limiting, metadata-only logging. */
import "server-only";
import { NextResponse } from "next/server";
import { AiError, type AiErrorCode } from "./sarvam";

export type ErrorCode = AiErrorCode | "RATE_LIMITED" | "BAD_INPUT" | "TOO_LARGE" | "UNEXPECTED";

const MESSAGES: Record<ErrorCode, { status: number; message: string }> = {
  NOT_CONFIGURED: { status: 503, message: "AI is not set up on this server yet (SARVAM_API_KEY is missing)." },
  INVALID_KEY: { status: 502, message: "The API key was rejected. Check the key configured on the server." },
  QUOTA_EXCEEDED: { status: 429, message: "The AI quota was reached. Wait a minute and try again, or use another key." },
  TIMEOUT: { status: 504, message: "The AI took too long to answer. Please try again." },
  NETWORK: { status: 502, message: "The server could not reach the AI service. Check the connection and try again." },
  INVALID_JSON: { status: 502, message: "The AI's answer was not in the expected format, even after a retry. Please try again." },
  BLOCKED: { status: 422, message: "The AI declined this request. Rephrase and try again." },
  MODEL_ERROR: { status: 502, message: "The AI service returned an error. Please try again in a moment." },
  RATE_LIMITED: { status: 429, message: "Too many requests in a short time. Please wait a minute." },
  BAD_INPUT: { status: 400, message: "Please check the input." },
  TOO_LARGE: { status: 413, message: "The request is too large. Please shorten the transcript or text." },
  UNEXPECTED: { status: 500, message: "Something went wrong. Please try again." },
};

export function fail(code: ErrorCode, message?: string, overrideMessages?: Partial<Record<ErrorCode, string>>) {
  const m = MESSAGES[code];
  return NextResponse.json(
    { error: { code, message: message ?? overrideMessages?.[code] ?? m.message } },
    { status: m.status },
  );
}

export function errorCode(e: unknown): ErrorCode {
  return e instanceof AiError ? e.code : "UNEXPECTED";
}

const buckets = new Map<string, number[]>();
/** Simple in-memory limiter: max N requests per key per minute (per server instance). */
export function rateLimited(req: Request, bucket: string, max: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  // Keep memory bounded on a long-running instance: drop idle buckets now and then.
  if (buckets.size > 5_000) for (const [k, ts] of buckets) if (!ts.some((t) => now - t < 60_000)) buckets.delete(k);
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > max;
}

/** Logs metadata only. Never pass transcript text or user messages here. */
export function logEvent(data: Record<string, string | number | boolean>) {
  console.info(JSON.stringify(data));
}

/** Per-route body limits in bytes (UTF-8). Transcripts are capped at 30,000 characters (≤ 90 KB in Devanagari). */
export const BODY_LIMITS = {
  analyze: 160_000,
  documents: 160_000,
  practiceStart: 40_000,
  practiceTurn: 120_000,
  practiceEvaluate: 220_000,
  tts: 8_000,
  /** Recorded voice answer (≈30 s of compressed audio). */
  stt: 2_000_000,
} as const;

/**
 * Reads and parses a JSON body with a hard byte limit (checked on Content-Length and on the actual bytes).
 * Returns { error } with a ready response when the body is too large or not JSON.
 */
export async function readJson(req: Request, maxBytes: number): Promise<{ body?: unknown; error?: Response }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { error: fail("TOO_LARGE") };
  let raw: ArrayBuffer;
  try {
    raw = await req.arrayBuffer();
  } catch {
    return { error: fail("BAD_INPUT", "Could not read the request.") };
  }
  if (raw.byteLength > maxBytes) return { error: fail("TOO_LARGE") };
  try {
    return { body: JSON.parse(new TextDecoder().decode(raw)) };
  } catch {
    return { error: fail("BAD_INPUT", "The request body is not valid JSON.") };
  }
}
