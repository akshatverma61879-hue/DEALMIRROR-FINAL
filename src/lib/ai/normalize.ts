/**
 * Turns validated model output into the Analysis shown in the UI:
 * verifies every quote, drops claims the user never made, and runs suggestion guards.
 */
import type { Analysis, Evidence, FindingKey, Findings, ValidDealInput } from "../types";
import { detectSpeakers, FINDING_KEYS, QUOTE_REQUIRED, SPEAKER_LINE } from "../types";
import type { ModelOutput } from "./schema";
import { containsLoosely, indexTranscript, verifyQuote } from "./evidence";
import { guardSuggestion } from "./guards";

export function normalizeAnalysis(out: ModelOutput, input: ValidDealInput, model: string): Analysis {
  const idx = indexTranscript(input.transcript);
  const ev = (q: string) => verifyQuote(idx, q);
  let unverified = 0;
  const track = (e: Evidence | null) => {
    if (e && !e.verified) unverified++;
    return e;
  };
  const ctx = { transcript: input.transcript, productFacts: input.productFacts, privateRules: input.privateRules };

  const usedIds = new Set<string>();
  const uniqueId = (id: string, prefix: string, i: number) => {
    let v = id.trim() || `${prefix}-${i + 1}`;
    while (usedIds.has(v)) v = `${v}-${i + 1}`;
    usedIds.add(v);
    return v;
  };

  let downgradedObjections = 0;
  const objections = out.objections.map((o, i) => {
    const buyerConcern = track(ev(o.buyerConcernQuote));
    const sellerResponse = track(ev(o.sellerResponseQuote));
    const buyerFollowUp = track(ev(o.buyerFollowUpQuote));
    const needsReview =
      !buyerConcern || !buyerConcern.verified || [sellerResponse, buyerFollowUp].some((e) => e && !e.verified);
    // "Resolved with evidence" needs the evidence: the concern and the buyer's acknowledgement.
    const status =
      o.status === "RESOLVED_WITH_EVIDENCE" && !(buyerConcern?.verified && buyerFollowUp?.verified)
        ? "UNKNOWN"
        : o.status;
    if (status !== o.status) downgradedObjections++;
    const unresolved = status !== "RESOLVED_WITH_EVIDENCE";
    return {
      id: uniqueId(o.id, "obj", i),
      category: o.category,
      title: o.title.trim() || "Buyer concern",
      buyerConcern: buyerConcern ?? { quote: "(no quote returned)", verified: false, line: null, start: null, end: null },
      sellerResponse,
      buyerFollowUp,
      explanation: o.explanation.trim(),
      status,
      confidence: o.confidence,
      isInferred: o.isInferred,
      needsReview,
      suggestion: unresolved
        ? guardSuggestion(o.suggestedResponse, o.suggestedResponseBasedOn, o.clarifyingQuestion, ctx)
        : null,
    };
  });

  const objectionIds = new Set(objections.map((o) => o.id));
  const illusions = out.illusions
    .map((il, i) => {
      const politePhrase = track(ev(il.politePhraseQuote));
      if (!politePhrase) return null; // nothing to show without the phrase itself
      const buyerConcern = track(ev(il.buyerConcernQuote));
      const sellerResponse = track(ev(il.sellerResponseQuote));
      const buyerFollowUp = track(ev(il.buyerFollowUpQuote));
      return {
        id: uniqueId(il.id, "ill", i),
        objectionId: objectionIds.has(il.objectionId) ? il.objectionId : null,
        politePhrase,
        buyerConcern,
        sellerResponse,
        buyerFollowUp,
        addressed: il.addressed.trim(),
        unconfirmed: il.unconfirmed.trim(),
        falseConfidence: il.falseConfidence.trim(),
        clarificationToSeek: il.clarificationToSeek.trim(),
        uncertainty: il.uncertainty,
        needsReview: [politePhrase, buyerConcern, sellerResponse, buyerFollowUp].some((e) => e && !e.verified),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Reality Check: keep only claims the user actually wrote.
  const impression = input.impression.text;
  let droppedClaims = 0;
  const realityCheck = impression
    ? out.realityCheck
        .filter((r) => {
          const ok = containsLoosely(impression, r.claim);
          if (!ok) droppedClaims++;
          return ok;
        })
        .map((r) => {
          const evidence = track(ev(r.evidenceQuote));
          return {
            claim: r.claim.trim(),
            evidence,
            verdict: r.verdict,
            explanation: r.explanation.trim(),
            needsReview: !!evidence && !evidence.verified,
          };
        })
    : [];

  // Findings: an unverified quote cannot drive a score deduction.
  let unclearedFindings = 0;
  const findings = Object.fromEntries(
    FINDING_KEYS.map((k: FindingKey) => {
      const f = out.findings[k];
      const e = ev(f.quote);
      // A value that claims something happened needs a verified quote (QUOTE_REQUIRED). Other
      // values usually mean the thing never happened, which has nothing to quote.
      const needsQuote = f.value !== "unclear" && QUOTE_REQUIRED[k].includes(f.value);
      const verified = e ? e.verified : !needsQuote;
      if (!verified && f.value !== "unclear") unclearedFindings++;
      return [k, { value: verified ? f.value : "unclear", quote: e?.quote ?? "", verified, line: e?.line ?? null }];
    }),
  ) as Findings;

  // Stakeholders: evidence-based only. No verified quote → removed. Present only if they are a speaker.
  const speakers = detectSpeakers(input.transcript).map((sp) => sp.label);
  const lines = idx.original.split("\n");
  const speakerOfLine = (line: number | null) => {
    if (!line) return null;
    const m = lines[line - 1]?.match(SPEAKER_LINE);
    return m ? m[1].trim() : null;
  };
  const isSpeaker = (name: string) => {
    const n = name.toLowerCase().trim();
    return speakers.find((label) => {
      const l = label.toLowerCase();
      return l === n || l.split(/[\s()]+/).includes(n) || l.startsWith(n + " ");
    });
  };
  let droppedStakeholders = 0;
  const seen = new Set<string>();
  const stakeholders = out.stakeholders
    .map((s, i) => {
      const e = ev(s.quote);
      const name = s.name.trim();
      if (!e || !e.verified || !name || !containsLoosely(input.transcript, name)) {
        droppedStakeholders++;
        return null;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      const label = isSpeaker(name);
      let status = s.status;
      let basis: string;
      if (label) {
        status = "CONFIRMED_PRESENT";
        basis = `Speaks in the transcript as “${label}”.`;
      } else if (status === "CONFIRMED_PRESENT") {
        status = "MENTIONED_ONLY";
        basis = "Named in the transcript but never speaks, so presence is not confirmed.";
      } else if (status === "MENTIONED_ONLY") {
        basis = "Referred to in the transcript but does not speak.";
      } else {
        basis = "The transcript does not make their participation clear.";
      }
      const mentionedBy = status === "CONFIRMED_PRESENT" ? null : speakerOfLine(e.line);
      return {
        id: `sh-${i + 1}`,
        name,
        role: s.role.trim() || "Role not stated",
        side: s.side,
        status,
        evidence: e,
        mentionedBy,
        basis,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const byName = (n: string) => stakeholders.find((s) => s.name.toLowerCase() === n.trim().toLowerCase());
  let droppedRelationships = 0;
  const relationships = out.relationships
    .map((r) => {
      const from = byName(r.from);
      const to = byName(r.to);
      const e = ev(r.quote);
      if (!from || !to || from.id === to.id || !e || !e.verified) {
        droppedRelationships++;
        return null;
      }
      return { from: from.id, to: to.id, type: r.type, evidence: e };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Sales stage: only trusted with a verified quote, otherwise UNKNOWN (neutral weights).
  const stageEv = out.salesStage.stage === "UNKNOWN" ? null : ev(out.salesStage.quote);
  const salesStage = stageEv?.verified
    ? { stage: out.salesStage.stage, evidence: stageEv }
    : { stage: "UNKNOWN" as const, evidence: null };
  const speakerTurns = lines.filter((l) => SPEAKER_LINE.test(l)).length;

  const notices: string[] = [];
  if (unverified) notices.push(`${unverified} quote${unverified > 1 ? "s" : ""} could not be found in the transcript and ${unverified > 1 ? "are" : "is"} marked “Needs review”.`);
  if (droppedClaims) notices.push(`${droppedClaims} Reality Check claim${droppedClaims > 1 ? "s were" : " was"} removed because ${droppedClaims > 1 ? "they were" : "it was"} not in your impression.`);
  if (unclearedFindings) notices.push(`${unclearedFindings} score input${unclearedFindings > 1 ? "s were" : " was"} set to “unclear” because the evidence could not be verified.`);
  if (downgradedObjections) notices.push(`${downgradedObjections} objection${downgradedObjections > 1 ? "s were" : " was"} marked “Unknown” instead of “Resolved” because the buyer's acknowledgement could not be verified.`);
  if (droppedStakeholders) notices.push(`${droppedStakeholders} stakeholder${droppedStakeholders > 1 ? "s were" : " was"} removed because the transcript does not support ${droppedStakeholders > 1 ? "them" : "it"}.`);
  if (droppedRelationships) notices.push(`${droppedRelationships} relationship${droppedRelationships > 1 ? "s were" : " was"} not drawn because no exact transcript evidence was found.`);
  if (!impression) notices.push("No meeting impression was entered, so Reality Check was skipped.");

  return {
    source: "sarvam",
    model,
    generatedAt: new Date().toISOString(),
    dealName: out.dealName.trim() || "This deal",
    dealValue: input.productFacts.productPrice || "Value not stated",
    buyerProblem: out.buyerProblem.trim(),
    callSummary: out.callSummary.trim(),
    objections,
    illusions,
    realityCheck,
    stakeholders,
    relationships,
    findings,
    salesStage,
    speakerTurns,
    notices,
  };
}
