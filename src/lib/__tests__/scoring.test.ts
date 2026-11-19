import { describe, expect, it } from "vitest";
import { bandFor, calculateScores, gaps, simulateScore, type ScoreInput } from "../scoring";
import { BANDS, CAPS, CRITERIA, MIN_TURNS_FOR_ABSENCE } from "../scoring-rubric";
import { FINDING_KEYS, type Evidence, type FindingKey, type Findings, type Illusion, type Objection, type RealityItem, type SalesStage } from "../types";

/* ---------------- builders ---------------- */

type V = "yes" | "no" | "unclear";
const ev = (quote = "q", verified = true): Evidence => ({ quote, verified, line: 2, start: 0, end: quote.length });

/** Unset findings are "unclear" (verified, i.e. the model said it cannot tell). */
function findings(values: Partial<Record<FindingKey, V>>, unverified: FindingKey[] = []): Findings {
  return Object.fromEntries(
    FINDING_KEYS.map((k) => {
      const bad = unverified.includes(k);
      return [k, { value: bad ? "unclear" : (values[k] ?? "unclear"), quote: values[k] === "yes" ? `quote for ${k}` : "", verified: !bad, line: 3 }];
    }),
  ) as Findings;
}

let n = 0;
function objection(status: Objection["status"], verified = true): Objection {
  return {
    id: `o-${n++}`, category: "PRICING", title: "Price", buyerConcern: ev("Too expensive.", verified), sellerResponse: ev("Here is why."),
    buyerFollowUp: ev("I see."), explanation: "", status, confidence: "high", isInferred: false, needsReview: false, suggestion: null,
  };
}

const illusion = (verified = true): Illusion => ({
  id: `i-${n++}`, objectionId: null, politePhrase: ev("Sounds good, we'll get back to you.", verified), buyerConcern: null, sellerResponse: null,
  buyerFollowUp: null, addressed: "", unconfirmed: "", falseConfidence: "", clarificationToSeek: "", uncertainty: "high", needsReview: false,
});

const reality = (verdict: RealityItem["verdict"]): RealityItem => ({ claim: "c", evidence: ev("line"), verdict, explanation: "", needsReview: false });

function input(
  f: Partial<Record<FindingKey, V>>,
  extra: Partial<Omit<ScoreInput, "findings" | "salesStage">> & { stage?: SalesStage; unverified?: FindingKey[] } = {},
): ScoreInput {
  return {
    findings: findings(f, extra.unverified),
    objections: extra.objections ?? [],
    illusions: extra.illusions ?? [],
    realityCheck: extra.realityCheck ?? [],
    salesStage: { stage: extra.stage ?? "EVALUATION", evidence: null },
    speakerTurns: extra.speakerTurns ?? 14,
  };
}

/* ---------------- scenarios (what a sales manager would expect) ---------------- */

// Hostile call: unsupported superlatives, no discovery, could not name features, buyer ends the call.
const HOSTILE = input(
  {
    buyer_problem_confirmed: "no", buying_signal: "no", buyer_commitment: "no", next_step_agreed: "no", decision_maker_required: "no",
    budget_or_timeline_discussed: "no", buyer_rejected: "yes", competitor_mentioned: "no",
    discovery_questions_asked: "no", value_linked_to_need: "no", unsupported_claims_made: "yes", seller_asked_for_next_step: "no",
  },
  { stage: "DISCOVERY" },
);
// buyer_questions_answered = "no" needs the evasive reply as its quote.
HOSTILE.findings.buyer_questions_answered = { value: "no", quote: "Sir, I can get back to you with the detailed information.", verified: true, line: 13 };

// Strong call: discovery, tailored value, competitor compared, pilot agreed, CFO meeting booked, budget deadline.
const STRONG = input(
  {
    buyer_problem_confirmed: "yes", buying_signal: "yes", buyer_commitment: "yes", next_step_agreed: "yes", decision_maker_required: "yes",
    decision_maker_engaged: "yes", budget_or_timeline_discussed: "yes", buyer_rejected: "no", competitor_mentioned: "yes",
    discovery_questions_asked: "yes", value_linked_to_need: "yes", buyer_questions_answered: "yes", competitor_addressed: "yes",
    unsupported_claims_made: "no", seller_asked_for_next_step: "yes",
  },
  { objections: [objection("RESOLVED_WITH_EVIDENCE")], realityCheck: [reality("SUPPORTED"), reality("SUPPORTED")] },
);

// Friendly but hollow: buyer sounds positive, objections open, "we'll get back to you", rosy impression.
const HOLLOW = input(
  {
    buyer_problem_confirmed: "yes", buying_signal: "yes", buyer_commitment: "no", next_step_agreed: "no", decision_maker_required: "yes",
    decision_maker_engaged: "no", budget_or_timeline_discussed: "no", buyer_rejected: "no", competitor_mentioned: "yes",
    discovery_questions_asked: "yes", value_linked_to_need: "no", buyer_questions_answered: "yes", competitor_addressed: "no",
    unsupported_claims_made: "no", seller_asked_for_next_step: "no",
  },
  { objections: [objection("UNANSWERED_OR_AVOIDED"), objection("POSSIBLY_UNRESOLVED")], illusions: [illusion()], realityCheck: [reality("CONTRADICTED"), reality("NOT_CONFIRMED")] },
);

describe("scenarios", () => {
  it("hostile call the buyer ended: Deal Health capped, Salesperson needs coaching, no hidden illusion", () => {
    const s = calculateScores(HOSTILE);
    expect(s.deal.score).toBeLessThanOrEqual(10);
    expect(s.deal.cap?.ruleId).toBe("cap-buyer-rejected");
    expect(s.seller.score).toBe(0);
    expect(s.seller.band).toBe("Needs coaching");
    expect(s.illusion.score).toBeLessThanOrEqual(15);
    expect(s.illusion.band).toBe("Low");
  });
  it("strong call: Healthy deal, Strong salesperson, low illusion risk", () => {
    const s = calculateScores(STRONG);
    expect(s.deal.score).toBe(100);
    expect(s.deal.band).toBe("Healthy");
    expect(s.seller.score).toBe(100);
    expect(s.seller.band).toBe("Strong");
    expect(s.illusion.score).toBeLessThanOrEqual(10);
  });
  it("friendly but hollow call: weak deal and HIGH illusion risk despite a well-mannered seller", () => {
    const s = calculateScores(HOLLOW);
    expect(s.deal.score).toBeLessThan(40);
    expect(s.illusion.score).toBeGreaterThanOrEqual(70);
    expect(s.illusion.band).toBe("High");
    // Independent scores: the seller did some things well even though the deal is weak.
    expect(s.seller.score!).toBeGreaterThan(s.deal.score!);
  });
  it("orders calls the way a manager would: strong > hollow > hostile", () => {
    const [st, ho, hs] = [STRONG, HOLLOW, HOSTILE].map((x) => calculateScores(x));
    expect(st.deal.score!).toBeGreaterThan(ho.deal.score!);
    expect(ho.deal.score!).toBeGreaterThan(hs.deal.score!);
    expect(st.seller.score!).toBeGreaterThan(ho.seller.score!);
    expect(ho.seller.score!).toBeGreaterThan(hs.seller.score!);
  });
});

/* ---------------- requirement by requirement ---------------- */

describe("1 · positive and negative evidence, not deduction from 100", () => {
  it("only judged criteria contribute; nothing starts with points", () => {
    const s = calculateScores(input({ buyer_commitment: "yes" }));
    expect(s.deal.criteria.filter((c) => c.outcome === "scored").map((c) => c.id)).toEqual(["deal-commitment"]);
  });
  it("positive evidence raises the score; negative evidence lowers it", () => {
    const base = { buyer_problem_confirmed: "yes", buying_signal: "yes", next_step_agreed: "no", buyer_commitment: "no" } as const;
    const s0 = calculateScores(input(base)).deal.score!;
    expect(calculateScores(input({ ...base, buyer_commitment: "yes" })).deal.score!).toBeGreaterThan(s0);
    expect(calculateScores(input({ ...base, buying_signal: "no" })).deal.score!).toBeLessThan(s0);
  });
});

describe("2 · three independent scores", () => {
  it("each card is calculated from its own criteria", () => {
    const s = calculateScores(STRONG);
    expect(s.deal.criteria.every((c) => c.id.startsWith("deal-"))).toBe(true);
    expect(s.seller.criteria.every((c) => c.id.startsWith("seller-"))).toBe(true);
    expect(s.illusion.criteria.every((c) => c.id.startsWith("ill-"))).toBe(true);
    expect(s.illusion.higherIsBetter).toBe(false);
  });
});

describe("3 · rewards buying signals, commitments, resolved objections and next steps", () => {
  it.each(["buying_signal", "buyer_commitment", "next_step_agreed"] as const)("%s = yes earns full credit with its quote", (k) => {
    const c = calculateScores(input({ [k]: "yes" })).deal.criteria.find((x) => x.outcome === "scored")!;
    expect(c.value).toBe(1);
    expect(c.evidence[0].quote).toBe(`quote for ${k}`);
  });
  it("a resolved objection raises Deal Health and lowers Illusion risk", () => {
    const base = { buying_signal: "yes", next_step_agreed: "no" } as const;
    const open = calculateScores(input(base, { objections: [objection("POSSIBLY_UNRESOLVED")] }));
    const done = calculateScores(input(base, { objections: [objection("RESOLVED_WITH_EVIDENCE")] }));
    expect(done.deal.score!).toBeGreaterThan(open.deal.score!);
    expect(done.illusion.score!).toBeLessThan(open.illusion.score!);
  });
});

describe("4 · missing information is not penalised", () => {
  it("all unclear → Insufficient evidence on every score, never 100 or 0", () => {
    const s = calculateScores(input({}));
    for (const c of [s.deal, s.seller, s.illusion]) {
      expect(c.score).toBeNull();
      expect(c.band).toBe("Insufficient evidence");
    }
  });
  it("an unclear criterion is left out of the calculation instead of scoring 0", () => {
    const s = calculateScores(input({ buyer_problem_confirmed: "yes", buying_signal: "yes", buyer_commitment: "yes", next_step_agreed: "yes" }));
    expect(s.deal.score).toBe(100);
    expect(s.deal.criteria.find((c) => c.id === "deal-decision-maker")?.outcome).toBe("insufficient");
  });
  it("a short call cannot prove that something never happened", () => {
    const f = { buyer_problem_confirmed: "no", buying_signal: "no", buyer_commitment: "no", next_step_agreed: "no" } as const;
    expect(calculateScores(input(f, { speakerTurns: MIN_TURNS_FOR_ABSENCE - 1 })).deal.score).toBeNull();
    expect(calculateScores(input(f, { speakerTurns: MIN_TURNS_FOR_ABSENCE })).deal.score).toBe(0);
  });
  it("an unverified quote makes the criterion insufficient, with the reason", () => {
    const c = calculateScores(input({ buyer_commitment: "yes" }, { unverified: ["buyer_commitment"] })).deal.criteria.find((x) => x.id === "deal-commitment")!;
    expect(c.outcome).toBe("insufficient");
    expect(c.note).toMatch(/could not be verified/);
  });
  it("below 50% coverage the score is withheld", () => {
    expect(calculateScores(input({ budget_or_timeline_discussed: "yes" })).deal.score).toBeNull();
  });
});

describe("5 · stage-adapted weights", () => {
  const f = { buyer_problem_confirmed: "yes", buying_signal: "yes", buyer_commitment: "no", next_step_agreed: "yes", budget_or_timeline_discussed: "no", decision_maker_required: "no" } as const;
  it("budget is not expected in discovery but counts in negotiation", () => {
    expect(calculateScores(input(f, { stage: "DISCOVERY" })).deal.criteria.find((c) => c.id === "deal-budget")!.outcome).toBe("not_applicable");
    expect(calculateScores(input(f, { stage: "NEGOTIATION" })).deal.criteria.find((c) => c.id === "deal-budget")!.outcome).toBe("scored");
  });
  it("no commitment yet is normal early: the same call is healthier as discovery than as negotiation", () => {
    expect(calculateScores(input(f, { stage: "DISCOVERY" })).deal.score!).toBeGreaterThan(calculateScores(input(f, { stage: "NEGOTIATION" })).deal.score!);
  });
  it("skipping discovery costs a seller more in a discovery call", () => {
    const g = { discovery_questions_asked: "no", value_linked_to_need: "yes", seller_asked_for_next_step: "yes" } as const;
    expect(calculateScores(input(g, { stage: "DISCOVERY" })).seller.score!).toBeLessThan(calculateScores(input(g, { stage: "NEGOTIATION" })).seller.score!);
  });
  it("UNKNOWN stage uses evaluation weights", () => {
    const u = calculateScores(input(f, { stage: "UNKNOWN" }));
    expect(u.weightsFrom).toBe("EVALUATION");
    expect(u.deal.score).toBe(calculateScores(input(f, { stage: "EVALUATION" })).deal.score);
  });
});

describe("6 · a clear agreed next action counts without a meeting", () => {
  it("next_step_agreed (e.g. pilot start agreed) earns full credit; no meeting-only finding exists", () => {
    expect(calculateScores(input({ next_step_agreed: "yes" })).deal.criteria.find((x) => x.id === "deal-next-step")!.value).toBe(1);
    expect(FINDING_KEYS as readonly string[]).not.toContain("next_meeting_booked");
  });
});

describe("7 · false agreement and unresolved objections", () => {
  it("polite agreement with no commitment is maximum risk; a real commitment halves it", () => {
    const none = calculateScores(input({ buyer_commitment: "no" }, { illusions: [illusion()] })).illusion.criteria.find((c) => c.id === "ill-polite")!;
    const some = calculateScores(input({ buyer_commitment: "yes" }, { illusions: [illusion()] })).illusion.criteria.find((c) => c.id === "ill-polite")!;
    expect(none.value).toBe(1);
    expect(some.value).toBe(0.5);
  });
  it("positive talk with no agreed next step is flagged", () => {
    expect(calculateScores(input({ buying_signal: "yes", next_step_agreed: "no" })).illusion.criteria.find((x) => x.id === "ill-commitment-gap")!.value).toBe(1);
  });
  it("open objections raise illusion risk in proportion", () => {
    const s = calculateScores(input({}, { objections: [objection("POSSIBLY_UNRESOLVED"), objection("RESOLVED_WITH_EVIDENCE")] }));
    // Answered-but-unconfirmed is half open; resolved is closed.
    expect(s.illusion.criteria.find((c) => c.id === "ill-unresolved")!.value).toBe(0.25);
  });
  it("contradicted impression claims raise illusion risk", () => {
    const s = calculateScores(input({}, { realityCheck: [reality("CONTRADICTED"), reality("SUPPORTED")] }));
    expect(s.illusion.criteria.find((c) => c.id === "ill-impression")!.value).toBe(0.5);
  });
  it("no polite phrases is not treated as proof of real agreement", () => {
    expect(calculateScores(input({})).illusion.criteria.find((c) => c.id === "ill-polite")!.outcome).toBe("not_applicable");
  });
  it("unverified objections and polite phrases are not used", () => {
    const s = calculateScores(input({}, { objections: [objection("UNANSWERED_OR_AVOIDED", false)], illusions: [illusion(false)] }));
    expect(s.deal.criteria.find((c) => c.id === "deal-objections")!.outcome).toBe("insufficient");
    expect(s.illusion.criteria.find((c) => c.id === "ill-polite")!.outcome).toBe("not_applicable");
  });
});

describe("8 · no double counting", () => {
  it("within each score, every finding or analysis list is read by exactly one criterion", () => {
    for (const id of ["deal", "seller", "illusion"] as const) {
      const reads = CRITERIA.filter((c) => c.score === id).flatMap((c) => c.reads);
      expect(new Set(reads).size, `${id}: ${reads.join(", ")}`).toBe(reads.length);
    }
  });
  it("every finding is used by at least one criterion or cap", () => {
    const used = new Set([...CRITERIA, ...CAPS].flatMap((c) => c.reads));
    for (const k of FINDING_KEYS) expect(used.has(`finding:${k}`), k).toBe(true);
  });
  it("an evasive reply to an objection is penalised once (Objection handling), not again as a dodged question", () => {
    const o = objection("UNANSWERED_OR_AVOIDED");
    o.sellerResponse = { ...ev("Hamara support bahut accha hai."), line: 9 };
    const x = input({}, { objections: [o] });
    x.findings.buyer_questions_answered = { value: "no", quote: "Hamara support bahut accha hai.", verified: true, line: 9 };
    const s = calculateScores(x).seller.criteria;
    expect(s.find((c) => c.id === "seller-answers")!.outcome).toBe("not_applicable");
    expect(s.find((c) => c.id === "seller-objection-handling")!.value).toBe(0);
    // A dodge on a different line (a real product question) still counts.
    x.findings.buyer_questions_answered = { ...x.findings.buyer_questions_answered, line: 12 };
    expect(calculateScores(x).seller.criteria.find((c) => c.id === "seller-answers")!.value).toBe(0);
  });
  it("penalty-only criteria add nothing when clean (no reward for merely not overclaiming)", () => {
    expect(calculateScores(input({ unsupported_claims_made: "no" })).seller.criteria.find((x) => x.id === "seller-claims")!.outcome).toBe("not_applicable");
  });
});

describe("evidence rules", () => {
  it("every scored criterion carries a verified quote or is explicitly based on absence", () => {
    for (const s of [STRONG, HOLLOW, HOSTILE].map((x) => calculateScores(x))) {
      for (const card of [s.deal, s.seller, s.illusion]) {
        for (const c of card.criteria.filter((x) => x.outcome === "scored")) expect(c.evidence.length > 0 || c.basedOnAbsence, c.id).toBe(true);
      }
    }
  });
  it("buyer asked no questions → answering is not applicable, neither a free pass nor a penalty", () => {
    expect(calculateScores(input({})).seller.criteria.find((x) => x.id === "seller-answers")!.outcome).toBe("not_applicable");
  });
  it("is deterministic", () => {
    expect(calculateScores(HOLLOW)).toEqual(calculateScores(HOLLOW));
  });
});

describe("rubric structure", () => {
  it("unique ids, documented rationale and recommendations, non-negative weights", () => {
    expect(new Set(CRITERIA.map((c) => c.id)).size).toBe(CRITERIA.length);
    for (const c of CRITERIA) {
      expect(c.rationale.length).toBeGreaterThan(20);
      expect(c.recommendation.length).toBeGreaterThan(20);
      expect(Object.values(c.weights).every((w) => w >= 0)).toBe(true);
    }
  });
  it("bands cover 0–100 without gaps for every score", () => {
    for (const bands of Object.values(BANDS)) {
      for (let s = 0; s <= 100; s++) expect(bands.filter((b) => s >= b.min && s <= b.max)).toHaveLength(1);
    }
  });
  it.each([
    ["deal", 39, "High risk"], ["deal", 40, "Moderate risk"], ["deal", 70, "Healthy"],
    ["seller", 39, "Needs coaching"], ["seller", 69, "Developing"], ["seller", 70, "Strong"],
    ["illusion", 29, "Low"], ["illusion", 30, "Medium"], ["illusion", 60, "High"],
  ] as const)("%s %i → %s", (id, s, label) => expect(bandFor(id, s).label).toBe(label));
});

describe("simulateScore", () => {
  const hollow = calculateScores(HOLLOW).deal;
  it("closing every gap reaches exactly 100", () => {
    expect(simulateScore(hollow, gaps(hollow).map((g) => g.id))).toBe(100);
  });
  it("the same action twice counts once; unknown ids are ignored", () => {
    const one = simulateScore(hollow, ["deal-commitment"]);
    expect(simulateScore(hollow, ["deal-commitment", "deal-commitment", "does-not-exist"])).toBe(one);
    expect(simulateScore(hollow, ["does-not-exist"])).toBe(hollow.score);
  });
  it("a cap holds unless its recovery is selected", () => {
    const hostile = calculateScores(HOSTILE).deal;
    const ids = gaps(hostile).map((g) => g.id);
    expect(simulateScore(hostile, ids)).toBe(10);
    expect(simulateScore(hostile, [...ids, "cap-buyer-rejected"])).toBe(100);
  });
  it("never changes the real card", () => {
    const before = JSON.stringify(hollow);
    simulateScore(hollow, gaps(hollow).map((g) => g.id));
    expect(JSON.stringify(hollow)).toBe(before);
  });
});
