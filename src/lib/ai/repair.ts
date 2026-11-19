/**
 * Best-effort repair of the model's raw JSON before Zod validation, so one small slip
 * (an enum in the wrong case, a null string, a missing field, one item too many) does not
 * throw away an otherwise usable analysis. Nothing is invented: unknown enums fall back to the
 * most cautious value, and items that cannot be repaired are dropped.
 */
import {
  SALES_STAGES,
  OBJECTION_CATEGORIES,
  OBJECTION_STATUSES,
  REALITY_VERDICTS,
  FINDING_KEYS,
  PARTICIPATION,
  RELATIONSHIP_TYPES,
} from "../types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";

const bool = (v: unknown): boolean => v === true || (typeof v === "string" && v.trim().toLowerCase() === "true");

/** Matches "Possibly unresolved", "possibly-unresolved", " POSSIBLY_UNRESOLVED " etc. */
function enumOf<T extends string>(values: readonly T[], v: unknown, fallback: T | null): T | null {
  const key = str(v).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const hit = values.find((x) => x.toUpperCase() === key);
  return hit ?? fallback;
}

const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" && v ? [v] : []);

function list(v: unknown, max: number, fix: (item: Obj, i: number) => Obj | null): Obj[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map(fix)
    .filter((x): x is Obj => x !== null)
    .slice(0, max);
}

export function repairModelOutput(raw: unknown): unknown {
  if (!isObj(raw)) return raw;

  const objections = list(raw.objections, 12, (o, i) => ({
    id: str(o.id) || `obj-${i + 1}`,
    category: enumOf(OBJECTION_CATEGORIES, o.category, "OTHER"),
    title: str(o.title),
    buyerConcernQuote: str(o.buyerConcernQuote),
    sellerResponseQuote: str(o.sellerResponseQuote),
    buyerFollowUpQuote: str(o.buyerFollowUpQuote),
    explanation: str(o.explanation),
    status: enumOf(OBJECTION_STATUSES, o.status, "UNKNOWN"),
    confidence: enumOf(["high", "medium", "low"] as const, str(o.confidence).toLowerCase(), "low"),
    isInferred: bool(o.isInferred),
    suggestedResponse: str(o.suggestedResponse),
    suggestedResponseBasedOn: strArray(o.suggestedResponseBasedOn),
    clarifyingQuestion: str(o.clarifyingQuestion),
  }));

  const illusions = list(raw.illusions, 8, (o, i) => ({
    id: str(o.id) || `ill-${i + 1}`,
    objectionId: str(o.objectionId),
    politePhraseQuote: str(o.politePhraseQuote),
    buyerConcernQuote: str(o.buyerConcernQuote),
    sellerResponseQuote: str(o.sellerResponseQuote),
    buyerFollowUpQuote: str(o.buyerFollowUpQuote),
    addressed: str(o.addressed),
    unconfirmed: str(o.unconfirmed),
    falseConfidence: str(o.falseConfidence),
    clarificationToSeek: str(o.clarificationToSeek),
    uncertainty: enumOf(["high", "medium", "low"] as const, str(o.uncertainty).toLowerCase(), "high"),
  }));

  const realityCheck = list(raw.realityCheck, 10, (o) =>
    str(o.claim)
      ? {
          claim: str(o.claim),
          evidenceQuote: str(o.evidenceQuote),
          verdict: enumOf(REALITY_VERDICTS, o.verdict, "INSUFFICIENT_EVIDENCE"),
          explanation: str(o.explanation),
        }
      : null,
  );

  const stakeholders = list(raw.stakeholders, 12, (o) => {
    const side = str(o.side).trim().toLowerCase();
    if (!str(o.name) || (side !== "seller" && side !== "buyer")) return null;
    return {
      name: str(o.name),
      role: str(o.role) || "Role not stated",
      side,
      status: enumOf(PARTICIPATION, o.status, "PARTICIPATION_UNKNOWN"),
      quote: str(o.quote),
    };
  });

  const relationships = list(raw.relationships, 12, (o) => {
    const type = enumOf(RELATIONSHIP_TYPES, o.type, null);
    if (!type || !str(o.from) || !str(o.to)) return null; // never guess a relationship
    return { from: str(o.from), to: str(o.to), type, quote: str(o.quote) };
  });

  const rawFindings = isObj(raw.findings) ? raw.findings : {};
  const findings = Object.fromEntries(
    FINDING_KEYS.map((k) => {
      const f = isObj(rawFindings[k]) ? (rawFindings[k] as Obj) : {};
      const value = str(f.value).trim().toLowerCase();
      return [k, { value: value === "yes" || value === "no" ? value : "unclear", quote: str(f.quote) }];
    }),
  );

  return {
    dealName: str(raw.dealName),
    callSummary: str(raw.callSummary),
    buyerProblem: str(raw.buyerProblem),
    objections,
    illusions,
    realityCheck,
    stakeholders,
    relationships,
    findings,
    salesStage: {
      stage: enumOf(SALES_STAGES, isObj(raw.salesStage) ? raw.salesStage.stage : raw.salesStage, "UNKNOWN"),
      quote: isObj(raw.salesStage) ? str(raw.salesStage.quote) : "",
    },
  };
}
