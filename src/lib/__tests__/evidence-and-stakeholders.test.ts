import { describe, expect, it } from "vitest";
import { indexTranscript, verifyQuote } from "../ai/evidence";
import { guardSuggestion } from "../ai/guards";
import { normalizeAnalysis } from "../ai/normalize";
import type { ModelOutput } from "../ai/schema";
import { buildStakeholderGraph } from "../stakeholder-graph";
import { SAMPLE_ANALYSIS } from "../mock-data";
import { EMPTY_INPUT } from "../input-defaults";
import { FINDING_KEYS, type ValidDealInput } from "../types";

const T = `Arjun (Sales): Good morning Rohit sir.
Rohit (Buyer): Honestly, ₹5 lakh is expensive. I need CFO approval.
Arjun (Sales): Sure sir, of course.
Rohit (Buyer): Our IT head may need to review this.
Priya (Buyer): Main bhi call pe hoon, theek hai.
Rohit (Buyer): Okay, we’ll think about it.`;

describe("verifyQuote", () => {
  const idx = indexTranscript(T);
  it("finds exact quotes and returns the original text and line", () => {
    expect(verifyQuote(idx, "I need CFO approval.")).toMatchObject({ verified: true, line: 2, quote: "I need CFO approval." });
  });
  it("tolerates straight vs curly apostrophes and case, but shows the transcript's exact text", () => {
    const e = verifyQuote(idx, "okay, we'll think about it.");
    expect(e?.verified).toBe(true);
    expect(e?.quote).toBe("Okay, we’ll think about it.");
  });
  it("supports ellipsis segments in order", () => {
    expect(verifyQuote(idx, "Honestly … CFO approval")?.verified).toBe(true);
    expect(verifyQuote(idx, "CFO approval … Honestly")?.verified).toBe(false);
  });
  it("flags invented quotes", () => {
    expect(verifyQuote(idx, "We have a signed contract.")).toMatchObject({ verified: false, line: null });
  });
  it("empty quote → null", () => expect(verifyQuote(idx, "  ")).toBeNull());
  it("works for Devanagari", () => {
    const hi = indexTranscript("खरीदार: ठीक है, लेकिन थोड़ा महंगा लग रहा है।");
    expect(verifyQuote(hi, "थोड़ा महंगा लग रहा है।")?.verified).toBe(true);
  });
});

describe("guardSuggestion", () => {
  const ctx = {
    transcript: T,
    productFacts: { ...EMPTY_INPUT.productFacts, productPrice: "₹5 lakh", verifiedBenefits: "40% less reporting time" },
    privateRules: { ...EMPTY_INPUT.privateRules, maxDiscount: "10%", walkAwayPrice: "₹3.5 lakh", discountApproval: "above 5% needs approval" },
  };
  it("withholds discounts above the limit", () => {
    expect(guardSuggestion("I can give a 15% discount.", [], "", ctx)?.withheld).toBe(true);
  });
  it("allows discounts within the limit", () => {
    expect(guardSuggestion("We could look at a 10% discount.", [], "", ctx)?.withheld).toBe(false);
  });
  it("withholds private figures such as the walk-away price", () => {
    expect(guardSuggestion("Our lowest is ₹3.5 lakh.", [], "", ctx)?.withheld).toBe(true);
  });
  it("does not confuse 15% with a private 5% threshold", () => {
    const g = guardSuggestion("Teams save 40% of reporting time.", [], "", ctx);
    expect(g?.withheld).toBe(false);
    expect(g?.warnings).toEqual([]);
  });
  it("warns on figures not in facts/transcript and on guarantees", () => {
    const g = guardSuggestion("You will save ₹12 lakh, guaranteed.", [], "", ctx);
    expect(g?.warnings.join(" ")).toMatch(/₹12 lakh/);
    expect(g?.warnings.join(" ")).toMatch(/guarantee/i);
  });
});

function modelOut(partial: Partial<ModelOutput>): ModelOutput {
  return {
    dealName: "",
    callSummary: "",
    buyerProblem: "",
    objections: [],
    illusions: [],
    realityCheck: [],
    stakeholders: [],
    relationships: [],
    findings: Object.fromEntries(FINDING_KEYS.map((k) => [k, { value: "unclear", quote: "" }])) as ModelOutput["findings"],
    salesStage: { stage: "UNKNOWN", quote: "" },
    ...partial,
  };
}
const input: ValidDealInput = { ...EMPTY_INPUT, transcript: T, impression: { text: "", confidence: null } };

describe("stakeholder evidence rules (normalize)", () => {
  const a = normalizeAnalysis(
    modelOut({
      stakeholders: [
        { name: "Arjun", role: "Sales", side: "seller", status: "CONFIRMED_PRESENT", quote: "Good morning Rohit sir." },
        { name: "Rohit", role: "Buyer", side: "buyer", status: "CONFIRMED_PRESENT", quote: "Honestly, ₹5 lakh is expensive." },
        { name: "CFO", role: "Approver", side: "buyer", status: "CONFIRMED_PRESENT", quote: "I need CFO approval." },
        { name: "IT head", role: "Reviewer", side: "buyer", status: "MENTIONED_ONLY", quote: "Our IT head may need to review this." },
        { name: "Priya", role: "Buyer", side: "buyer", status: "PARTICIPATION_UNKNOWN", quote: "Main bhi call pe hoon, theek hai." },
        { name: "CEO", role: "Chief executive", side: "buyer", status: "MENTIONED_ONLY", quote: "The CEO wants this done." },
        { name: "Procurement", role: "Procurement manager", side: "buyer", status: "MENTIONED_ONLY", quote: "" },
      ],
      relationships: [
        { from: "CFO", to: "Rohit", type: "APPROVES", quote: "I need CFO approval." },
        { from: "CEO", to: "Rohit", type: "APPROVES", quote: "The CEO approves everything." },
        { from: "IT head", to: "Rohit", type: "WORKS_WITH", quote: "invented line" },
      ],
    }),
    input,
    "test-model",
  );
  const by = (n: string) => a.stakeholders.find((s) => s.name === n);

  it("drops stakeholders that are not in the transcript (no invented CEO / procurement)", () => {
    expect(by("CEO")).toBeUndefined();
    expect(by("Procurement")).toBeUndefined();
    expect(a.notices.join(" ")).toMatch(/2 stakeholders were removed/);
  });
  it("'I need CFO approval' → CFO is MENTIONED_ONLY even if the model said present", () => {
    expect(by("CFO")?.status).toBe("MENTIONED_ONLY");
    expect(by("CFO")?.mentionedBy).toBe("Rohit (Buyer)");
  });
  it("IT head stays mentioned, participation unconfirmed", () => {
    expect(by("IT head")?.status).toBe("MENTIONED_ONLY");
  });
  it("anyone who speaks is CONFIRMED_PRESENT", () => {
    expect(by("Priya")?.status).toBe("CONFIRMED_PRESENT");
    expect(by("Rohit")?.status).toBe("CONFIRMED_PRESENT");
  });
  it("keeps only relationships with verified quotes between known stakeholders", () => {
    expect(a.relationships).toHaveLength(1);
    expect(a.relationships[0].type).toBe("APPROVES");
  });

  it("graph edges are all evidence-backed", () => {
    const g = buildStakeholderGraph(a);
    const kinds = g.edges.map((e) => e.kind).sort();
    // Arjun↔Rohit and Arjun↔Priya on the call; CFO→Rohit approves (replaces the mention); IT head mentioned by Rohit
    expect(kinds).toEqual(["APPROVES", "conversation", "conversation", "mention"]);
    const it_ = g.edges.find((e) => e.kind === "mention");
    expect(it_?.evidenceLine).toBe(4);
  });
});

describe("sample analysis", () => {
  it("every sample quote is verified", () => {
    for (const o of SAMPLE_ANALYSIS.objections) expect(o.buyerConcern.verified).toBe(true);
    for (const s of SAMPLE_ANALYSIS.stakeholders) expect(s.evidence.verified).toBe(true);
  });
  it("Nova radar: Arjun↔Rohit on the call, Meera approves (mentioned only)", () => {
    const g = buildStakeholderGraph(SAMPLE_ANALYSIS);
    expect(g.edges.map((e) => e.kind).sort()).toEqual(["APPROVES", "conversation"]);
  });
});

describe("scoring evidence rules (normalize)", () => {
  const f = (over: Partial<Record<string, { value: "yes" | "no" | "unclear"; quote: string }>>) =>
    ({ ...modelOut({}).findings, ...over }) as ModelOutput["findings"];
  it("buyer_questions_answered = no needs the evasive reply as a verified quote", () => {
    const noQuote = normalizeAnalysis(modelOut({ findings: f({ buyer_questions_answered: { value: "no", quote: "" } }) }), input, "m");
    expect(noQuote.findings.buyer_questions_answered.value).toBe("unclear");
    const quoted = normalizeAnalysis(modelOut({ findings: f({ buyer_questions_answered: { value: "no", quote: "Honestly, ₹5 lakh is expensive." } }) }), input, "m");
    expect(quoted.findings.buyer_questions_answered.value).toBe("no");
  });
  it("a plain 'no' (never happened) needs no quote", () => {
    const a = normalizeAnalysis(modelOut({ findings: f({ buyer_commitment: { value: "no", quote: "" } }) }), input, "m");
    expect(a.findings.buyer_commitment.value).toBe("no");
  });
  it("sales stage is trusted only with a verified quote", () => {
    const ok = normalizeAnalysis(modelOut({ salesStage: { stage: "NEGOTIATION", quote: "Honestly, ₹5 lakh is expensive." } }), input, "m");
    expect(ok.salesStage.stage).toBe("NEGOTIATION");
    const invented = normalizeAnalysis(modelOut({ salesStage: { stage: "NEGOTIATION", quote: "We signed the contract." } }), input, "m");
    expect(invented.salesStage).toEqual({ stage: "UNKNOWN", evidence: null });
  });
  it("counts speaker turns in code", () => {
    expect(normalizeAnalysis(modelOut({}), input, "m").speakerTurns).toBe(T.split("\n").filter((l) => /^\s*[^:\n\d][^:\n]{0,39}?\s*:\s*\S/.test(l)).length);
  });
});
