/**
 * Minimal server-only Sarvam AI client (REST, OpenAI-style chat completions). The API key is read
 * from the environment and never leaves the server. Used for the LLM, text-to-speech and speech-to-text.
 */
import "server-only";

export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_KEY"
  | "QUOTA_EXCEEDED"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_JSON"
  | "BLOCKED"
  | "MODEL_ERROR";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const REASONING = ["none", "low", "medium", "high", "max", "off"] as const;

export function aiConfig() {
  const effort = (process.env.SARVAM_REASONING_EFFORT || "off").toLowerCase();
  return {
    apiKey: (process.env.SARVAM_API_KEY ?? "").trim(),
    model: process.env.SARVAM_MODEL || "sarvam-105b",
    baseUrl: (process.env.SARVAM_API_BASE || "https://api.sarvam.ai").replace(/\/$/, ""),
    timeoutMs: Number(process.env.SARVAM_TIMEOUT_MS) || 90_000,
    reasoningEffort: (REASONING as readonly string[]).includes(effort) ? effort : "off",
  };
}

/** Auth headers for any Sarvam endpoint. */
export function sarvamHeaders(apiKey: string): Record<string, string> {
  return { "api-subscription-key": apiKey };
}

interface GenerateOptions {
  system: string;
  user: string;
  jsonSchema?: Record<string, unknown>;
}

export interface SarvamError {
  error?: { message?: string; code?: string | number; request_id?: string };
  detail?: unknown;
  message?: string;
}

interface ChatResponse extends SarvamError {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null; reasoning_content?: string | null } }[];
}

export function classify(status: number, data: SarvamError, service = "Sarvam"): AiError {
  const msg = `${data.error?.message ?? data.message ?? ""} ${data.error?.code ?? ""}`;
  if (status === 401 || status === 403 || /invalid.*(api|subscription).?key|unauthori[sz]ed|authentication/i.test(msg)) {
    return new AiError("INVALID_KEY", `The ${service} API key was rejected.`);
  }
  if (status === 429 || status === 402 || /quota|rate.?limit|insufficient.*credit/i.test(msg)) {
    return new AiError("QUOTA_EXCEEDED", `The ${service} quota, credit or rate limit was reached.`);
  }
  return new AiError("MODEL_ERROR", `${service} returned an error (HTTP ${status}).`);
}

/** Removes reasoning traces some models put inline, and any prose around the JSON object. */
export function extractJsonText(content: string): string {
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }
  return text;
}

type Format = "json" | "none";

/**
 * Output cap. Valid analyses are ~2-3k tokens; a reply at the cap is almost always the model
 * looping on whitespace, so a lower cap makes that failure (and its retry) fast.
 */
const MAX_TOKENS = 8_192;

async function post(body: unknown, signal: AbortSignal) {
  const { apiKey, baseUrl } = aiConfig();
  return fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...sarvamHeaders(apiKey) },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
}

/** Calls the Sarvam chat model in JSON mode and returns the JSON text of the first choice. */
export async function generateJson({ system, user, jsonSchema }: GenerateOptions): Promise<string> {
  const { apiKey, model, timeoutMs, reasoningEffort } = aiConfig();
  if (!apiKey) throw new AiError("NOT_CONFIGURED", "SARVAM_API_KEY is not set on the server.");

  // The schema goes in the prompt, not response_format.json_schema: Sarvam's schema-constrained
  // decoding often returns a skeleton of empty strings or loops on whitespace until max_tokens,
  // while JSON mode with the schema in the prompt returns valid, filled-in output.
  const schemaText = jsonSchema ? `\n\nJSON SCHEMA (use exactly these keys and enum values):\n${JSON.stringify(jsonSchema)}` : "";
  const body = (format: Format) => ({
    model,
    messages: [
      { role: "system", content: `${system}${schemaText}\n\nReply with a single JSON object only. No markdown, no commentary.` },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    reasoning_effort: reasoningEffort === "off" ? null : reasoningEffort,
    ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await post(body("json"), controller.signal);
      // If a model rejects JSON mode, retry once without response_format (Zod still validates).
      if (res.status === 400 || res.status === 422) {
        res = await post(body("none"), controller.signal);
      }
    } catch (e) {
      if (controller.signal.aborted) throw new AiError("TIMEOUT", "Sarvam did not respond in time.");
      throw new AiError("NETWORK", `Could not reach Sarvam (${(e as Error).name}).`);
    }

    const data = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) throw classify(res.status, data);
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new AiError("BLOCKED", "Sarvam declined the request.");
    if (choice?.finish_reason === "content_filter") throw new AiError("BLOCKED", "Sarvam blocked the request (content filter).");
    if (choice?.finish_reason === "length") {
      console.info(JSON.stringify({ event: "llm_truncated", model, max_tokens: MAX_TOKENS }));
    }
    const text = extractJsonText(choice?.message?.content ?? "");
    if (!text) throw new AiError("INVALID_JSON", "Sarvam returned an empty response.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (controller.signal.aborted) throw new AiError("TIMEOUT", "Sarvam did not respond in time.");
    throw new AiError("NETWORK", "Network error while calling Sarvam.");
  } finally {
    clearTimeout(timer);
  }
}
