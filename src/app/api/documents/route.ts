import { NextResponse } from "next/server";
import { buyerDocumentInputSchema } from "@/lib/documents/types";
import { generateDocuments } from "@/lib/ai/documents";
import { BODY_LIMITS, errorCode, fail, logEvent, rateLimited, readJson } from "@/lib/ai/http";

export const maxDuration = 90;

/**
 * POST /api/documents — Mutual action plan + CFO memo.
 * Accepts ONLY the strict buyer-document schema: requests containing private sales rules, the salesperson's
 * impression, marketing claims or score data are rejected before any AI call.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "documents", 12)) return fail("RATE_LIMITED");
  const { body, error } = await readJson(req, BODY_LIMITS.documents);
  if (error) return error;
  const parsed = buyerDocumentInputSchema.safeParse(body);
  if (!parsed.success) {
    const unknown = parsed.error.issues.find((i) => i.code === "unrecognized_keys");
    return fail(
      "BAD_INPUT",
      unknown
        ? `Rejected: buyer documents may not receive these fields: ${(unknown as { keys?: string[] }).keys?.join(", ")}.`
        : "Invalid document request.",
    );
  }
  const started = Date.now();
  try {
    const docs = await generateDocuments(parsed.data);
    logEvent({ event: "documents", ok: true, items: docs.plan.items.length, ms: Date.now() - started });
    return NextResponse.json({ documents: docs });
  } catch (e) {
    const code = errorCode(e);
    logEvent({ event: "documents", ok: false, code, ms: Date.now() - started });
    return fail(code);
  }
}
