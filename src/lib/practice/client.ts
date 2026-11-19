/** Browser-side helpers for the practice endpoints. */
import type { Analysis, DealInput, Language, Objection } from "../types";
import type { PracticeContext } from "./types";

export type ApiError = { code: string; message: string };

export async function postJson<T>(url: string, body: unknown, timeoutMs = 70_000): Promise<{ data?: T; error?: ApiError }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: c.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        error: data?.error?.code
          ? data.error
          : { code: "NETWORK", message: `The server answered unexpectedly (HTTP ${res.status}). Live AI needs the running app, not the static preview.` },
      };
    }
    return { data: data as T };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { error: { code: "TIMEOUT", message: "The request took too long. Please try again." } };
    return { error: { code: "NETWORK", message: "Could not reach the DealMirror server. Check your connection." } };
  } finally {
    clearTimeout(t);
  }
}

export function unresolvedObjections(a: Analysis): Objection[] {
  return a.objections.filter((o) => o.status !== "RESOLVED_WITH_EVIDENCE");
}

/** Builds the buyer-safe practice context. Private rules are deliberately NOT included. */
export function buildPracticeContext(a: Analysis, input: DealInput, objection: Objection, language: Language): PracticeContext {
  return {
    language,
    objection: {
      id: objection.id,
      category: objection.category,
      title: objection.title.slice(0, 200),
      buyerConcern: objection.buyerConcern.quote.slice(0, 1000),
      sellerResponse: (objection.sellerResponse?.quote ?? "").slice(0, 1000),
      explanation: objection.explanation.slice(0, 1000),
    },
    callSummary: a.callSummary.slice(0, 2000),
    buyerProblem: a.buyerProblem.slice(0, 1000),
    realNames: a.stakeholders.map((s) => s.name).slice(0, 20),
    productFacts: input.productFacts,
  };
}

export const newId = () => Math.random().toString(36).slice(2, 10);
