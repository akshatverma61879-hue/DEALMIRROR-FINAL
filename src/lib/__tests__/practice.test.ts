import { describe, expect, it } from "vitest";
import { checkSellerMessage, flagsFor, neverPromiseItems } from "../practice/compliance";
import { PRACTICE_RUBRIC, weightedOverall } from "../practice/rubric";
import { turnRequestSchema, ttsRequestSchema, startRequestSchema } from "../practice/types";
import { buildPracticeContext, unresolvedObjections } from "../practice/client";
import { SAMPLE_ANALYSIS, SAMPLE_NOVA_INPUT } from "../mock-data";
import { EMPTY_INPUT } from "../input-defaults";

const ctx = {
  privateRules: { ...EMPTY_INPUT.privateRules, maxDiscount: "10%", walkAwayPrice: "₹3.5 lakh", neverPromise: "24/7 support; custom integrations" },
  productFacts: { ...EMPTY_INPUT.productFacts, productPrice: "₹5 lakh per year", verifiedBenefits: "3 customers cut reporting time by 40%" },
  transcript: "Rohit (Buyer): ₹5 lakh is expensive. ReportRight quoted ₹3 lakh. We have 18 stores.",
};

describe("practice compliance (code checks on the salesperson)", () => {
  it("flags a 20% offer against a 10% limit", () => {
    expect(checkSellerMessage("I can give you a 20% discount today.", ctx).violations[0]).toMatch(/20%.*10%/);
  });
  it("allows a discount within the limit", () => {
    expect(checkSellerMessage("We could do a 10% discount for annual billing.", ctx).violations).toEqual([]);
  });
  it("flags Hinglish discount phrasing", () => {
    expect(checkSellerMessage("Sir, 15% chhoot de denge.", ctx).violations).toHaveLength(1);
  });
  it("flags revealing the walk-away price", () => {
    expect(checkSellerMessage("Our lowest is ₹3.5 lakh, final.", ctx).violations.join()).toMatch(/walk-away/);
  });
  it("flags never-promise items (unsupported features)", () => {
    expect(neverPromiseItems(ctx.privateRules)).toEqual(["24/7 support", "custom integrations"]);
    expect(checkSellerMessage("Yes, we give 24/7 support.", ctx).violations.join()).toMatch(/24\/7 support/);
    expect(checkSellerMessage("We can build custom integrations for you.", ctx).violations.join()).toMatch(/custom integrations/);
  });
  it("flags figures not in facts or the call, accepts ones that are", () => {
    expect(checkSellerMessage("You'll save ₹12 lakh a year.", ctx).unsupportedFigures).toEqual(["₹12 lakh"]);
    expect(checkSellerMessage("Three customers cut reporting time by 40% across 18 stores.", ctx).unsupportedFigures).toEqual([]);
  });
  it("clean answer → no flags", () => {
    expect(flagsFor(checkSellerMessage("What does the ReportRight quote include?", ctx))).toEqual([]);
  });
});

describe("practice rubric", () => {
  it("weights sum to 100 and cover all 7 dimensions", () => {
    expect(PRACTICE_RUBRIC.reduce((s, r) => s + r.weight, 0)).toBe(100);
    expect(PRACTICE_RUBRIC).toHaveLength(7);
  });
  it("weighted overall: all 10 → 100, all 0 → 0, clamps out-of-range", () => {
    expect(weightedOverall(PRACTICE_RUBRIC.map((r) => ({ id: r.id, score: 10 })))).toBe(100);
    expect(weightedOverall(PRACTICE_RUBRIC.map((r) => ({ id: r.id, score: 0 })))).toBe(0);
    expect(weightedOverall(PRACTICE_RUBRIC.map((r) => ({ id: r.id, score: 15 })))).toBe(100);
  });
  it("matches the API test: 6,5,5,6,9,2,4 → 52", () => {
    const s = [6, 5, 5, 6, 9, 2, 4];
    expect(weightedOverall(PRACTICE_RUBRIC.map((r, i) => ({ id: r.id, score: s[i] })))).toBe(52);
  });
});

describe("privacy boundaries", () => {
  const context = buildPracticeContext(SAMPLE_ANALYSIS, SAMPLE_NOVA_INPUT, unresolvedObjections(SAMPLE_ANALYSIS)[0], "Hinglish");
  it("practice context never contains private rules", () => {
    const json = JSON.stringify(context);
    expect(json).not.toMatch(/walk-away|₹4 lakh|Maximum discount|privateRules|close to closing/i);
  });
  it("start / turn / tts schemas reject a privateRules field", () => {
    expect(startRequestSchema.safeParse({ ...context, privateRules: {} }).success).toBe(false);
    expect(ttsRequestSchema.safeParse({ text: "hi", language: "English", privateRules: {} }).success).toBe(false);
    const persona = { name: "V", role: "r", businessConcerns: [], negotiationStyle: "", objectionSummary: "" };
    expect(turnRequestSchema.safeParse({ context, persona, history: [{ id: "1", role: "seller", text: "x" }], privateRules: {} }).success).toBe(false);
    expect(turnRequestSchema.safeParse({ context, persona, history: [{ id: "1", role: "seller", text: "x" }] }).success).toBe(true);
  });
  it("only unresolved objections are offered", () => {
    expect(unresolvedObjections(SAMPLE_ANALYSIS).every((o) => o.status !== "RESOLVED_WITH_EVIDENCE")).toBe(true);
  });
});
