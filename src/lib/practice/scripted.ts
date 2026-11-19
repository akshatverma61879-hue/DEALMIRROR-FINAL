/**
 * SCRIPTED SAMPLE PRACTICE — no AI. Used only in Sample Demo mode, clearly labelled.
 * The buyer's reply is chosen by simple, documented rules on the salesperson's message;
 * the scorecard uses the same rubric weights and code compliance checks as live practice.
 */
import type { Language, PrivateRules, ProductFacts } from "../types";
import type { BuyerStance, PracticeMessage, Scorecard } from "./types";
import type { BuyerTone } from "./tone";
import { PRACTICE_RUBRIC, CAPS, weightedOverall } from "./rubric";
import { checkSellerMessage } from "./compliance";

type Lines = Record<"opening" | "sceptical" | "probing" | "softening" | "ready" | "ruleBreak", string>;

const LINES: Record<Language, Lines> = {
  English: {
    opening: "Arjun, honestly ₹5 lakh still feels high when LeadLine quoted ₹3 lakh. Why should we pay ₹2 lakh more?",
    sceptical: "Every vendor says their product is better. That doesn't tell me why we should pay ₹2 lakh more. What exactly do we get for the difference?",
    probing: "That's a fair question to ask me. But how do I know the difference is worth it for a 25-person team? I'll need something concrete for Meera.",
    softening: "Okay, that's a more useful way to look at it. If follow-ups really improve like that, I could take it to Meera. What would you need from us?",
    ready: "That works. Let's set up the call with Meera — send me two time slots and I'll confirm one.",
    ruleBreak: "That sounds generous. Can you put that in writing? I'd want to check it with Meera before we rely on it.",
  },
  Hindi: {
    opening: "देखिए अर्जुन, ₹5 लाख अभी भी ज़्यादा लग रहा है, LeadLine ने ₹3 लाख बोला है। हम ₹2 लाख ज़्यादा क्यों दें?",
    sceptical: "हर वेंडर यही कहता है कि उनका प्रोडक्ट बेहतर है। ₹2 लाख ज़्यादा किस चीज़ के लिए, ये साफ़ नहीं है।",
    probing: "सवाल ठीक है। लेकिन 25 लोगों की टीम के लिए ये फ़र्क सही है, ये मैं कैसे मानूँ? मीरा जी को कुछ ठोस चाहिए होगा।",
    softening: "हाँ, इस तरह देखना ज़्यादा काम का है। अगर फ़ॉलो-अप सच में सुधरते हैं, तो मैं मीरा जी से बात कर सकता हूँ। आपको हमसे क्या चाहिए?",
    ready: "ठीक है। मीरा जी के साथ कॉल रख लेते हैं — दो समय भेज दीजिए, मैं एक कन्फ़र्म कर दूँगा।",
    ruleBreak: "ये तो काफ़ी अच्छा ऑफ़र लग रहा है। क्या आप ये लिखित में दे सकते हैं? मीरा जी से पहले पूछना होगा।",
  },
  Hinglish: {
    opening: "Dekhiye Arjun, ₹5 lakh abhi bhi zyada lag raha hai. LeadLine ne ₹3 lakh quote kiya hai, toh hum ₹2 lakh extra kyun dein?",
    sceptical: "Har vendor yahi bolta hai ki unka product better hai. Par ₹2 lakh extra kis cheez ke liye, yeh clear nahi hai.",
    probing: "Sawaal theek hai. Par 25 logon ki team ke liye yeh difference worth it hai, yeh kaise maanu? Meera ma'am ko kuch concrete chahiye hoga.",
    softening: "Haan, is tarah dekhna zyada useful hai. Agar follow-ups sach mein improve hote hain, toh main Meera ma'am se baat kar sakta hoon. Aapko humse kya chahiye?",
    ready: "Theek hai. Meera ma'am ke saath call rakh lete hain — do time slots bhej dijiye, main ek confirm kar dunga.",
    ruleBreak: "Yeh toh kaafi generous lag raha hai. Kya aap yeh likhit mein de sakte hain? Meera ma'am se pehle check karna padega.",
  },
};

export function scriptedOpening(language: Language) {
  return LINES[language].opening;
}

interface Ctx {
  privateRules: PrivateRules;
  productFacts: ProductFacts;
  transcript: string;
}

/** Signals read from the salesperson's message (documented rules). */
export function readSignals(text: string, ctx: Ctx) {
  const asksQuestion = /\?|\b(what|how|why|which|could you|can you|kya|kaise|kyun|kitna)\b|क्या|कैसे|कितना/i.test(text);
  const facts = Object.values(ctx.productFacts).join(" ").toLowerCase();
  const usesVerifiedFigure = (text.match(/\d+(?:\.\d+)?\s?%|₹\s?\d[\d,.]*\s?(?:lakh)?/gi) ?? []).some((f) =>
    facts.includes(f.toLowerCase().replace(/\s/g, "")) || facts.includes(f.toLowerCase()),
  );
  const proposesNextStep = /\b(call|meeting|meet|demo|thursday|monday|tuesday|wednesday|friday|this week|next week|slot|calendar|invite)\b|मीटिंग|कॉल/i.test(text);
  const compliance = checkSellerMessage(text, ctx);
  return { asksQuestion, usesVerifiedFigure, proposesNextStep, compliance };
}

/**
 * Buyer reply rules:
 *  - Breaks a private rule → cautious "put it in writing" reply (never accepts).
 *  - First reply can never be agreement.
 *  - Points: question +1, verified figure +1, concrete next step +1.
 *    0 → sceptical, 1 → probing, 2 → softening, 3 (after the first turn) → ready for next step.
 *  - Tone: a second weak answer in a row makes the buyer FRUSTRATED instead of SCEPTICAL.
 */
export function scriptedBuyerReply(
  history: PracticeMessage[],
  language: Language,
  ctx: Ctx,
): { reply: string; stance: BuyerStance; tone: BuyerTone } {
  const sellerTurns = history.filter((m) => m.role === "seller");
  const last = sellerTurns[sellerTurns.length - 1]?.text ?? "";
  const s = readSignals(last, ctx);
  const L = LINES[language];
  if (s.compliance.violations.length) return { reply: L.ruleBreak, stance: "PROBING", tone: "CURIOUS" };
  const points = Number(s.asksQuestion) + Number(s.usesVerifiedFigure) + Number(s.proposesNextStep);
  if (points >= 3 && sellerTurns.length > 1) return { reply: L.ready, stance: "READY_FOR_NEXT_STEP", tone: "ENTHUSIASTIC" };
  if (points >= 2) return { reply: L.softening, stance: "SOFTENING", tone: "WARM" };
  if (points === 1) return { reply: L.probing, stance: "PROBING", tone: "CURIOUS" };
  const lastBuyer = [...history].reverse().find((m) => m.role === "buyer");
  const repeatedWeak = sellerTurns.length > 1 && lastBuyer?.stance === "SCEPTICAL";
  return { reply: L.sceptical, stance: "SCEPTICAL", tone: repeatedWeak ? "FRUSTRATED" : "SCEPTICAL" };
}

const STRONGER: Record<Language, string> = {
  English:
    "Rohit, could you share what LeadLine's ₹3 lakh includes? You mentioned follow-ups keep slipping for your 25-person team. Three of our customers reduced missed follow-ups by 30% (illustrative figure). Could we work that out for your team and review it with Meera in a 30-minute call this week?",
  Hindi:
    "रोहित जी, LeadLine के ₹3 लाख में क्या-क्या शामिल है? आपने बताया कि 25 लोगों की टीम के फ़ॉलो-अप छूट जाते हैं। हमारे तीन ग्राहकों के छूटे हुए फ़ॉलो-अप 30% कम हुए (उदाहरण के आँकड़े)। क्या इस हफ़्ते मीरा जी के साथ 30 मिनट की कॉल में ये हिसाब देख लें?",
  Hinglish:
    "Rohit ji, LeadLine ke ₹3 lakh mein kya-kya included hai? Aapne bataya ki 25 logon ki team ke follow-ups slip ho jaate hain. Hamare teen customers ke missed follow-ups 30% kam hue (illustrative figure). Kya is hafte Meera ma'am ke saath 30 minute ki call mein yeh hisaab dekh lein?",
};

/** Heuristic scorecard for scripted practice (no AI). Same rubric weights and code caps as live practice. */
export function scriptedScorecard(history: PracticeMessage[], language: Language, ctx: Ctx): Scorecard {
  const seller = history.filter((m) => m.role === "seller");
  const sig = seller.map((m) => ({ m, s: readSignals(m.text, ctx) }));
  const any = (k: "asksQuestion" | "usesVerifiedFigure" | "proposesNextStep") => sig.find((x) => x.s[k]);
  const violations = [...new Set(sig.flatMap((x) => x.s.compliance.violations))];
  const unsupported = [...new Set(sig.flatMap((x) => x.s.compliance.unsupportedFigures))];
  const firstQuote = (k: "asksQuestion" | "usesVerifiedFigure" | "proposesNextStep") => {
    const hit = any(k);
    return hit ? { quote: hit.m.text.slice(0, 120), verified: true } : null;
  };
  const generic = seller.some((m) => /better product|more features|best|cleaner interface|features zyada|बेहतर/i.test(m.text));

  const raw: Record<string, { score: number; reason: string; evidence: { quote: string; verified: boolean } | null }> = {
    UNDERSTANDING: any("asksQuestion")
      ? { score: 8, reason: "You asked about the buyer's situation before defending the price.", evidence: firstQuote("asksQuestion") }
      : { score: 3, reason: "You did not ask what is behind the price concern.", evidence: null },
    OBJECTION_HANDLING: generic
      ? { score: 3, reason: "A general “better product / more features” answer does not address the price gap.", evidence: { quote: seller.find((m) => /better|features|best|cleaner|बेहतर/i.test(m.text))!.text.slice(0, 120), verified: true } }
      : any("asksQuestion") || any("usesVerifiedFigure")
        ? { score: 7, reason: "You engaged with the concern instead of deflecting.", evidence: firstQuote("asksQuestion") ?? firstQuote("usesVerifiedFigure") }
        : { score: 4, reason: "The concern was acknowledged but not really addressed.", evidence: null },
    PRODUCT_ACCURACY: { score: 9, reason: "No claims beyond your product facts were detected.", evidence: null },
    VALUE_COMMUNICATION: any("usesVerifiedFigure")
      ? { score: 8, reason: "You linked value to a verified figure.", evidence: firstQuote("usesVerifiedFigure") }
      : { score: 3, reason: "No verified figure or buyer-specific value was used.", evidence: null },
    PROFESSIONALISM: { score: 8, reason: "Polite and professional tone.", evidence: null },
    RULE_COMPLIANCE: { score: 10, reason: "Stayed within your private sales rules.", evidence: null },
    FOLLOW_UP: any("proposesNextStep")
      ? { score: 8, reason: "You proposed a concrete next step.", evidence: firstQuote("proposesNextStep") }
      : { score: 2, reason: "No specific next step or meeting was proposed.", evidence: null },
  };

  const dimensions = PRACTICE_RUBRIC.map((r) => {
    const d = raw[r.id];
    let score = d.score;
    let cappedBy: string | null = null;
    if (r.id === "RULE_COMPLIANCE" && violations.length) {
      score = CAPS.ruleViolation;
      cappedBy = "A private sales rule was broken (checked in code).";
    }
    if (r.id === "PRODUCT_ACCURACY" && unsupported.length) {
      score = Math.min(score, CAPS.unsupportedFigure);
      cappedBy = `Used figures not in your facts: ${unsupported.join(", ")} (checked in code).`;
    }
    return { id: r.id, label: r.label, weight: r.weight, score, aiScore: d.score, reason: d.reason, evidence: d.evidence, cappedBy };
  });

  const strengths = dimensions.filter((d) => d.score >= 7).map((d) => d.reason).slice(0, 3);
  const weaknesses = dimensions.filter((d) => d.score < 5).map((d) => d.reason).slice(0, 3);
  const suggestions = [
    !any("asksQuestion") && "Ask what the competitor quote includes before defending your price.",
    !any("usesVerifiedFigure") && "Use your verified figure (30% fewer missed follow-ups, illustrative) and tie it to the buyer's 25-person team.",
    !any("proposesNextStep") && "Close with a specific next step: a 30-minute call with the CFO this week.",
    violations.length > 0 && "Stay within your discount limit and never promise items on your never-promise list.",
  ].filter(Boolean) as string[];

  return {
    overall: weightedOverall(dimensions),
    dimensions,
    strengths,
    weaknesses,
    suggestions,
    strongerResponse: { text: STRONGER[language], warnings: [], withheld: false },
    ruleViolations: violations,
    model: "Scripted sample coach (rule-based, no AI)",
  };
}
