import { describe, expect, it } from "vitest";
import { SAMPLE_ANALYSIS, SAMPLE_DEAL_INPUT, SAMPLE_DOCUMENTS, SAMPLE_PERSONA } from "../sample-deal";
import { calculateScores, gaps, simulateScore } from "../scoring";
import { analysisSchema, dealInputSchema } from "../types";
import { containsLoosely } from "../ai/evidence";
import { buildStakeholderGraph } from "../stakeholder-graph";
import { planToText, memoToText, TBD } from "../documents/review";
import { scanForPrivateInfo, toBuyerDocumentInput } from "../documents/build";
import { buyerDocumentInputSchema } from "../documents/types";
import { scriptedBuyerReply, scriptedOpening, scriptedScorecard } from "../practice/scripted";
import type { PracticeMessage } from "../practice/types";

const scores = calculateScores(SAMPLE_ANALYSIS);

describe("sample deal inputs", () => {
  it("matches the brief and passes input validation", () => {
    const i = SAMPLE_DEAL_INPUT;
    expect(i.productFacts.productName).toMatch(/SalesPro/);
    expect(i.productFacts.productDescription).toMatch(/B2B CRM/);
    expect(i.productFacts.productPrice).toMatch(/₹5 lakh per year/);
    expect(i.productFacts.competitorPricing).toMatch(/₹3 lakh per year/);
    expect(i.impression.text).toBe("The meeting went very well, the buyer liked the product, and I think we are close to closing.");
    expect(dealInputSchema.safeParse(i).success).toBe(true);
  });
  it("is clearly fictional", () => {
    expect(i18n(SAMPLE_DEAL_INPUT.productFacts.companyName)).toMatch(/fictional/i);
    expect(SAMPLE_ANALYSIS.dealName).toMatch(/fictional/i);
    expect(SAMPLE_PERSONA.role).toMatch(/fictional/i);
  });
});
function i18n(s: string) {
  return s;
}

describe("worked example: three scores from the sample call", () => {
  it("analysis is a valid, sample-labelled Analysis", () => {
    expect(analysisSchema.safeParse(SAMPLE_ANALYSIS).success).toBe(true);
    expect(SAMPLE_ANALYSIS.source).toBe("sample");
    expect(SAMPLE_ANALYSIS.model).toBeNull();
  });
  it("evaluation stage, every criterion judged from evidence", () => {
    expect(scores.stage).toBe("EVALUATION");
    for (const card of [scores.deal, scores.seller, scores.illusion]) expect(card.coverage).toBe(1);
  });
  it("Deal Health 32 (High risk): need and interest earned, no commitment or next step", () => {
    const d = scores.deal;
    expect(d.score).toBe(32);
    expect(d.band).toBe("High risk");
    const earned = Object.fromEntries(d.criteria.map((c) => [c.id, c.value]));
    expect(earned).toMatchObject({ "deal-need": 1, "deal-interest": 1, "deal-commitment": 0, "deal-next-step": 0, "deal-decision-maker": 0, "deal-budget": 0 });
    expect(d.cap).toBeNull();
  });
  it("Salesperson 41 (Developing): answered questions and tied value to the need, but no discovery or next-step ask", () => {
    const s = scores.seller;
    expect(s.score).toBe(41);
    expect(s.band).toBe("Developing");
    const v = Object.fromEntries(s.criteria.map((c) => [c.id, c.value]));
    expect(v).toMatchObject({ "seller-value": 1, "seller-answers": 1, "seller-discovery": 0, "seller-claims": 0, "seller-next-step": 0 });
  });
  it("Illusion of Agreement Risk 84 (High): polite close, all objections open, rosy impression", () => {
    expect(scores.illusion.score).toBe(84);
    expect(scores.illusion.band).toBe("High");
  });
  it("simulator: closing every Deal Health gap reaches 100; the real score is unchanged", () => {
    expect(simulateScore(scores.deal, gaps(scores.deal).map((g) => g.id))).toBe(100);
    expect(scores.deal.score).toBe(32);
  });
  it("every quote is verified in the transcript", () => {
    const a = SAMPLE_ANALYSIS;
    const all = [
      ...a.objections.flatMap((o) => [o.buyerConcern, o.sellerResponse, o.buyerFollowUp]),
      ...a.illusions.flatMap((i) => [i.politePhrase, i.buyerConcern, i.sellerResponse, i.buyerFollowUp]),
      ...a.realityCheck.map((r) => r.evidence),
      ...a.stakeholders.map((s) => s.evidence),
      ...a.relationships.map((r) => r.evidence),
    ].filter(Boolean);
    expect(all.every((e) => e!.verified)).toBe(true);
    expect(Object.values(a.findings).every((f) => f.verified && containsLoosely(SAMPLE_DEAL_INPUT.transcript, f.quote))).toBe(true);
  });
  it("demonstrates each brief point", () => {
    const a = SAMPLE_ANALYSIS;
    expect(a.objections.find((o) => o.category === "PRICING")?.status).toBe("UNANSWERED_OR_AVOIDED");
    expect(a.illusions[0].politePhrase.quote).toMatch(/sounds good/);
    expect(a.stakeholders.find((s) => s.role.includes("CFO"))?.status).toBe("MENTIONED_ONLY");
    expect(a.findings.next_step_agreed.value).toBe("no");
  });
  it("Reality Check only uses claims from the impression", () => {
    for (const r of SAMPLE_ANALYSIS.realityCheck) expect(containsLoosely(SAMPLE_DEAL_INPUT.impression.text, r.claim)).toBe(true);
  });
  it("suggestions pass the code guards with no warnings", () => {
    for (const o of SAMPLE_ANALYSIS.objections) {
      expect(o.suggestion?.withheld).toBe(false);
      expect(o.suggestion?.warnings).toEqual([]);
    }
  });
  it("radar: CFO is a mentioned-only ghost who approves the buyer", () => {
    const g = buildStakeholderGraph(SAMPLE_ANALYSIS);
    expect(g.edges.map((e) => e.kind).sort()).toEqual(["APPROVES", "conversation"]);
  });
});

describe("sample documents", () => {
  it("nothing is claimed as agreed; all proposed with TBD dates", () => {
    expect(SAMPLE_DOCUMENTS.generatedBy).toBe("sample");
    expect(SAMPLE_DOCUMENTS.plan.decisions).toEqual([]);
    expect(SAMPLE_DOCUMENTS.plan.items.every((i) => i.status === "PROPOSED" && i.due === TBD)).toBe(true);
  });
  it("memo states benefits need validation and uses only verified facts", () => {
    const benefits = SAMPLE_DOCUMENTS.memo.sections.find((s) => s.key === "benefits")!;
    expect(benefits.body).toMatch(/30%/);
    expect(benefits.body).toMatch(/require validation/);
    expect(memoToText(SAMPLE_DOCUMENTS.memo)).not.toMatch(/Best CRM|easiest/i);
  });
  it("pass the final privacy scan", () => {
    const i = SAMPLE_DEAL_INPUT;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { marketingClaims, ...pub } = i.productFacts;
    const findings = scanForPrivateInfo(
      [
        { label: "plan", text: planToText(SAMPLE_DOCUMENTS.plan) },
        { label: "memo", text: memoToText(SAMPLE_DOCUMENTS.memo) },
      ],
      i.privateRules,
      i.impression.text,
      i.transcript + "\n" + Object.values(pub).join("\n"),
    );
    expect(findings).toEqual([]);
  });
  it("isolated document input built from the sample excludes private data", () => {
    const d = toBuyerDocumentInput(SAMPLE_ANALYSIS, SAMPLE_DEAL_INPUT);
    expect(buyerDocumentInputSchema.safeParse(d).success).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/₹4 lakh|walk-away|close to closing|Best CRM/i);
  });
});

describe("scripted sample practice (no AI)", () => {
  const ctx = { privateRules: SAMPLE_DEAL_INPUT.privateRules, productFacts: SAMPLE_DEAL_INPUT.productFacts, transcript: SAMPLE_DEAL_INPUT.transcript };
  const h = (...seller: string[]): PracticeMessage[] =>
    seller.flatMap((t, i) => [
      { id: `b${i}`, role: "buyer" as const, text: "…" },
      { id: `s${i}`, role: "seller" as const, text: t },
    ]);
  it("weak answer → sceptical; strong answer → softening; never ready on the first reply", () => {
    expect(scriptedBuyerReply(h("Sir, SalesPro is a much better product."), "English", ctx).stance).toBe("SCEPTICAL");
    expect(scriptedBuyerReply(h("What does LeadLine include? Our customers cut missed follow-ups by 30%."), "English", ctx).stance).toBe("SOFTENING");
    expect(scriptedBuyerReply(h("What does LeadLine include? 30% fewer missed follow-ups. Call with Meera on Thursday?"), "English", ctx).stance).toBe("SOFTENING");
    expect(scriptedBuyerReply(h("ok", "What does LeadLine include? 30% fewer missed follow-ups. Call with Meera on Thursday?"), "English", ctx).stance).toBe("READY_FOR_NEXT_STEP");
  });
  it("rule break → cautious reply, compliance capped in the scorecard", () => {
    const hist = h("I can give you 20% discount and 24/7 support.");
    expect(scriptedBuyerReply(hist, "English", ctx).reply).toMatch(/writing/);
    const card = scriptedScorecard(hist, "English", ctx);
    expect(card.dimensions.find((d) => d.id === "RULE_COMPLIANCE")?.score).toBe(2);
    expect(card.ruleViolations).toHaveLength(2);
    expect(card.model).toMatch(/no AI/);
  });
  it("works in Hindi and Hinglish", () => {
    expect(scriptedOpening("Hindi")).toMatch(/₹5 लाख/);
    expect(scriptedOpening("Hinglish")).toMatch(/zyada lag raha/);
    expect(scriptedBuyerReply(h("Hum better hain"), "Hinglish", ctx).reply).toMatch(/Har vendor/);
  });
  it("better practice scores higher", () => {
    const weak = scriptedScorecard(h("Sir, SalesPro is a much better product."), "English", ctx).overall;
    const strong = scriptedScorecard(h("What does LeadLine's ₹3 lakh include? Three customers cut missed follow-ups by 30%. Could we do a call with Meera on Thursday?"), "English", ctx).overall;
    expect(strong).toBeGreaterThan(weak + 25); // 83 vs 54: a rule-abiding weak answer still keeps compliance and accuracy points
  });
});
