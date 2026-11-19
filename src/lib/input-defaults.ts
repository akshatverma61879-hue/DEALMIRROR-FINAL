import type { DealInput } from "./types";

export const EMPTY_INPUT: DealInput = {
  transcript: "",
  language: "English",
  productFacts: {
    companyName: "",
    productName: "",
    productDescription: "",
    productPrice: "",
    productFeatures: "",
    targetCustomers: "",
    competitors: "",
    competitorPricing: "",
    verifiedBenefits: "",
    availableOffers: "",
    marketingClaims: "",
  },
  privateRules: {
    maxDiscount: "",
    walkAwayPrice: "",
    discountApproval: "",
    negotiationRestrictions: "",
    neverPromise: "",
    additionalInstructions: "",
  },
  impression: { text: "", confidence: null },
};

export function countFilled(obj: Record<string, string>) {
  return Object.values(obj).filter((v) => v.trim().length > 0).length;
}
