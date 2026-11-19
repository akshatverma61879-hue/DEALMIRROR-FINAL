import { describe, expect, it } from "vitest";
import { buyerDocumentInputSchema, type BuyerDocumentInput } from "../documents/types";
import {
  BENEFITS_NEED_VALIDATION,
  buildMemo,
  factSections,
  normalizeDue,
  normalizeOwner,
  normalizeStatus,
  planToText,
  reviewDecisions,
  reviewPlanItems,
  sanitizeNarrative,
  TBD,
  UNASSIGNED,
} from "../documents/review";
import { scanForPrivateInfo, templateDocuments, toBuyerDocumentInput } from "../documents/build";
import { SAMPLE_ANALYSIS, SAMPLE_NOVA_INPUT } from "../mock-data";

const T = `Kavya (Sales): Could we set a 30-minute call with Meera on Thursday at 4 pm?
Anil (Buyer): Thursday 4 works. Send the invite.
Anil (Buyer): We already signed the NDA last week.`;

const input: BuyerDocumentInput = {
  language: "English",
  dealName: "Anil Traders",
  callSummary: "s",
  buyerProblem: "Reporting takes two days.",
  transcript: T,
  objections: [],
  stakeholders: [
    { name: "Kavya", role: "Sales", side: "seller", status: "CONFIRMED_PRESENT" },
    { name: "Anil", role: "Buyer", side: "buyer", status: "CONFIRMED_PRESENT" },
    { name: "Meera", role: "Finance head", side: "buyer", status: "MENTIONED_ONLY" },
  ],
  facts: {
    companyName: "SalesPro Analytics",
    productName: "SalesPro",
    productDescription: "Reporting software.",
    productPrice: "₹5 lakh per year",
    productFeatures: "Live dashboards, 40+ templates",
    targetCustomers: "",
    competitors: "",
    competitorPricing: "",
    verifiedBenefits: "",
    availableOffers: "",
  },
};

describe("data isolation (buyer-document schema)", () => {
  const built = toBuyerDocumentInput(SAMPLE_ANALYSIS, SAMPLE_NOVA_INPUT);
  it("built input contains no private rules, impression, marketing claims or score", () => {
    const json = JSON.stringify(built);
    expect(json).not.toMatch(/walk-away|3\.5 lakh|Maximum discount|10%|privateRules|impression|marketingClaims|Best-in-class|Marking this as Hot|deductions|score/i);
    expect(buyerDocumentInputSchema.safeParse(built).success).toBe(true);
  });
  it("rejects extra fields at every level", () => {
    expect(buyerDocumentInputSchema.safeParse({ ...built, privateRules: {} }).success).toBe(false);
    expect(buyerDocumentInputSchema.safeParse({ ...built, impression: { text: "x" } }).success).toBe(false);
    expect(buyerDocumentInputSchema.safeParse({ ...built, facts: { ...built.facts, marketingClaims: "x" } }).success).toBe(false);
    expect(buyerDocumentInputSchema.safeParse({ ...built, stakeholders: [{ ...built.stakeholders[0], evidence: {} }] }).success).toBe(false);
  });
});

describe("action plan rules", () => {
  it("AGREED/COMPLETED need a verified quote, otherwise PROPOSED", () => {
    expect(normalizeStatus("AGREED", null).status).toBe("PROPOSED");
    expect(normalizeStatus("COMPLETED", { quote: "x", verified: false, line: null }).status).toBe("PROPOSED");
    expect(normalizeStatus("AGREED", { quote: "x", verified: true, line: 2 }).status).toBe("AGREED");
    expect(normalizeStatus("UNKNOWN", null).status).toBe("UNKNOWN");
  });
  it("dates must be in the transcript, otherwise TBD", () => {
    expect(normalizeDue("Thursday at 4 pm", T)).toBe("Thursday at 4 pm");
    expect(normalizeDue("15 December", T)).toBe(TBD);
    expect(normalizeDue("", T)).toBe(TBD);
    expect(normalizeDue("N/A", T)).toBe(TBD);
  });
  it("owners must be known, otherwise Unassigned", () => {
    expect(normalizeOwner("Kavya", input)).toBe("Kavya");
    expect(normalizeOwner("SalesPro Analytics team", input)).toBe("SalesPro Analytics team");
    expect(normalizeOwner("Procurement team", input)).toBe(UNASSIGNED);
    expect(normalizeOwner("", input)).toBe(UNASSIGNED);
  });
  it("reviews a full set of items and reports what changed", () => {
    const { items, notices } = reviewPlanItems(
      [
        { task: "Review call with Meera", owner: "Kavya", status: "AGREED", dueDate: "Thursday at 4 pm", evidenceQuote: "Thursday 4 works. Send the invite.", justification: "" },
        { task: "NDA", owner: "Anil", status: "COMPLETED", dueDate: "", evidenceQuote: "We already signed the NDA last week.", justification: "" },
        { task: "Send pricing", owner: "Ops", status: "AGREED", dueDate: "Monday", evidenceQuote: "", justification: "" },
        { task: "  ", owner: "", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "" },
      ],
      input,
      "AI",
    );
    expect(items.map((i) => [i.status, i.owner, i.due])).toEqual([
      ["AGREED", "Kavya", "Thursday at 4 pm"],
      ["COMPLETED", "Anil", TBD],
      ["PROPOSED", UNASSIGNED, TBD],
    ]);
    expect(items[0].evidence?.line).toBe(2);
    expect(notices.join(" ")).toMatch(/1 task was changed to Proposed/);
  });
  it("decisions without a verified quote are removed", () => {
    const r = reviewDecisions([{ text: "Call on Thursday", evidenceQuote: "Thursday 4 works." }, { text: "Will sign", evidenceQuote: "We will sign." }], input);
    expect(r.decisions).toHaveLength(1);
    expect(r.notices[0]).toMatch(/removed/);
  });
  it("plain-text export separates agreed from proposed", () => {
    const { items } = reviewPlanItems(
      [
        { task: "A", owner: "Kavya", status: "AGREED", dueDate: "Thursday at 4 pm", evidenceQuote: "Thursday 4 works.", justification: "" },
        { task: "B", owner: "", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "" },
      ],
      input,
      "AI",
    );
    const t = planToText({ title: "T", meetingSummary: "S", decisions: [], openQuestions: [], items });
    expect(t.indexOf("Agreed next steps")).toBeLessThan(t.indexOf("- A |"));
    expect(t.indexOf("Proposed next steps")).toBeLessThan(t.indexOf("- B | Owner: Unassigned | Due: TBD | Proposed"));
  });
});

describe("CFO memo rules", () => {
  it("removes invented ROI, certifications, savings, testimonials and guarantees", () => {
    const text =
      "Reporting takes two days. This delivers 300% ROI. SalesPro is SOC 2 certified. You will save ₹12 lakh. Results are guaranteed. A customer said it changed everything.";
    const r = sanitizeNarrative(text, input);
    expect(r.text).toBe("Reporting takes two days.");
    expect(r.removed).toHaveLength(5);
  });
  it("keeps figures that are in the facts or transcript", () => {
    expect(sanitizeNarrative("The list price is ₹5 lakh per year.", input).text).toMatch(/₹5 lakh/);
  });
  it("benefits section says validation is needed when no verified benefits exist", () => {
    expect(factSections(input.facts).benefits.body).toBe(BENEFITS_NEED_VALIDATION);
  });
  it("capabilities and pricing are built only from verified facts", () => {
    const f = factSections(input.facts);
    expect(f.capabilities.body).toContain("• Live dashboards");
    expect(f.capabilities.origin).toBe("FACTS");
    expect(f.pricing.body).toContain("₹5 lakh per year");
  });
  it("memo has all 8 sections in order and addresses the mentioned approver", () => {
    const { memo } = buildMemo({ businessContext: "c", problem: "p", proposedSolution: "s", risksAndQuestions: ["r"], nextSteps: ["n"] }, input, "AI");
    expect(memo.sections.map((s) => s.heading.slice(0, 2))).toEqual(["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8."]);
    expect(memo.to).toBe("Meera, Finance head");
  });
});

describe("template draft (no AI)", () => {
  it("everything is Proposed / TBD / Unassigned and grounded in the analysis", () => {
    const d = templateDocuments(SAMPLE_ANALYSIS, toBuyerDocumentInput(SAMPLE_ANALYSIS, SAMPLE_NOVA_INPUT));
    expect(d.generatedBy).toBe("template");
    expect(d.plan.items.length).toBeGreaterThan(0);
    expect(d.plan.items.every((i) => i.status === "PROPOSED" && i.due === TBD && i.owner === UNASSIGNED)).toBe(true);
    expect(d.plan.decisions).toEqual([]);
  });
});

describe("final privacy scan", () => {
  const rules = { maxDiscount: "10%", walkAwayPrice: "₹3.5 lakh", discountApproval: "Any discount above 5% needs sales head approval", negotiationRestrictions: "", neverPromise: "24/7 support", additionalInstructions: "" };
  const impression = "Went really well. Rohit is very interested and price is not a real problem. Marking this as Hot.";
  const pub = "₹5 lakh per year. 40% reporting time.";
  const scan = (text: string) => scanForPrivateInfo([{ label: "Doc", text }], rules, impression, pub);
  it("flags private figures, rule text, score mentions and private notes", () => {
    expect(scan("Our best price could go to ₹3.5 lakh.")).toHaveLength(1);
    expect(scan("We can offer 10% off.")).toHaveLength(1);
    expect(scan("Any discount above 5% needs sales head approval")).toHaveLength(1);
    expect(scan("Deal health 42/100")).toHaveLength(1);
    expect(scan("Rohit is very interested and price is not a real problem")).toHaveLength(1);
    expect(scan("Walk-away price discussion")).toHaveLength(1);
  });
  it("passes clean buyer text, including public figures", () => {
    expect(scan("List price: ₹5 lakh per year. Three customers cut reporting time by 40%.")).toEqual([]);
  });
});
