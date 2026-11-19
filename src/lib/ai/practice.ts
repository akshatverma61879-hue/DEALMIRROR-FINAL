/**
 * AI buyer practice (server only): persona generation, buyer turns and the coaching scorecard.
 * The buyer never receives private sales rules. Only the coach (evaluation) does.
 */
import "server-only";
import { z } from "zod";
import { AiError, aiConfig, generateJson } from "./sarvam";
import { UNTRUSTED_DATA_RULES, formatPrivateRules, formatProductFacts, wrapUntrusted } from "./prompt-safety";
import { guardSuggestion } from "./guards";
import { containsLoosely } from "./evidence";
import {
  BUYER_STANCES,
  PRACTICE_DIMENSIONS,
  type BuyerStance,
  type Persona,
  type PracticeContext,
  type PracticeMessage,
  type Scorecard,
} from "../practice/types";
import { CAPS, PRACTICE_RUBRIC, weightedOverall } from "../practice/rubric";
import { BUYER_TONES, TONE_META, resolveTone, speakable, type BuyerTone } from "../practice/tone";
import { checkSellerMessage } from "../practice/compliance";
import type { PrivateRules } from "../types";

const LANGUAGE_RULES: Record<PracticeContext["language"], string> = {
  English: "Write in natural Indian business English.",
  Hindi: "Write in natural spoken Hindi in Devanagari script, as an Indian business buyer would speak. Keep common business words like 'software', 'demo', 'invoice' in English where that is how people actually say them.",
  Hinglish:
    "Write in natural conversational Hinglish in Roman script, mixing Hindi and English the way Indian business buyers actually talk (e.g. 'Dekhiye, price thoda zyada lag raha hai, ReportRight ka quote kam hai'). Do not translate word-by-word and do not use Devanagari.",
};

const FALLBACK_NAMES = ["Vikram Mehta", "Ananya Rao", "Sanjay Kulkarni", "Neha Bhatia", "Arvind Iyer", "Pooja Desai"];

async function askJson<T extends z.ZodTypeAny>(system: string, user: string, schema: T): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateJson({
      system,
      user: attempt === 0 ? user : `${user}\n\nYour previous reply was invalid (${reason}). Return ONLY valid JSON.`,
      jsonSchema,
    });
    try {
      const parsed = schema.safeParse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")));
      if (parsed.success) return parsed.data;
      reason = `schema mismatch at ${parsed.error.issues[0]?.path.join(".")}`;
    } catch {
      reason = "not JSON";
    }
  }
  throw new AiError("INVALID_JSON", `Sarvam's answer did not match the expected format (${reason}).`);
}

function contextBlock(ctx: PracticeContext) {
  return [
    wrapUntrusted("objection", `${ctx.objection.title}\nBuyer said: "${ctx.objection.buyerConcern}"\nSeller replied: "${ctx.objection.sellerResponse}"\nWhy unresolved: ${ctx.objection.explanation}`),
    wrapUntrusted("call_summary", ctx.callSummary),
    wrapUntrusted("buyer_problem", ctx.buyerProblem),
    wrapUntrusted("public_product_facts", formatProductFacts(ctx.productFacts)),
  ].join("\n\n");
}

/* ---------------- Persona ---------------- */

const personaOut = z.object({
  name: z.string().describe("A FICTIONAL Indian name. Must not be any of the real names provided."),
  role: z.string().describe("Job role consistent with the transcript (e.g. Operations Head)."),
  businessConcerns: z
    .array(z.object({ text: z.string(), source: z.enum(["TRANSCRIPT", "SIMULATED"]).describe("TRANSCRIPT if stated in the call; SIMULATED if it is a plausible practice follow-up.") }))
    .min(2)
    .max(5),
  negotiationStyle: z.string().describe("One sentence, e.g. 'Polite but data-driven; compares vendors line by line.'"),
  objectionSummary: z.string().describe("The selected objection in one sentence."),
  openingMessage: z.string().describe("The buyer's first message: re-raise the selected objection in their own words, in the selected language, under 60 words. Written to be spoken aloud."),
  openingTone: z.enum(BUYER_TONES).describe("How the opening is voiced: usually SCEPTICAL, or FRUSTRATED if the call showed the buyer was annoyed."),
});

const PERSONA_SYSTEM = `PERSONA_TASK. You create a FICTIONAL B2B buyer persona for a sales practice exercise.
${UNTRUSTED_DATA_RULES}
- The persona is fictional. Never reuse a real person's name. Ground concerns in the transcript summary; mark any added follow-up concern as SIMULATED.
- Do not invent facts about the real buyer company. Do not mention any discount limits or internal seller rules (you do not know them).`;

export async function generatePersona(ctx: PracticeContext): Promise<{ persona: Persona; opening: string; openingTone: BuyerTone }> {
  const out = await askJson(
    PERSONA_SYSTEM,
    `Language: ${ctx.language}. ${LANGUAGE_RULES[ctx.language]}\nReal names you must NOT use: ${ctx.realNames.join(", ") || "(none)"}\n\n${contextBlock(ctx)}\n\nReturn the persona JSON.`,
    personaOut,
  );
  const real = ctx.realNames.map((n) => n.toLowerCase());
  const clash = real.some((r) => out.name.toLowerCase().includes(r) || r.includes(out.name.toLowerCase().split(" ")[0]));
  const name = clash || !out.name.trim() ? FALLBACK_NAMES.find((n) => !real.some((r) => n.toLowerCase().includes(r)))! : out.name.trim();
  return {
    persona: {
      name,
      role: out.role.trim(),
      businessConcerns: out.businessConcerns,
      negotiationStyle: out.negotiationStyle.trim(),
      objectionSummary: out.objectionSummary.trim(),
    },
    opening: speakable(out.openingMessage),
    // The opening re-raises an unresolved objection, so it is never warm or enthusiastic.
    openingTone: resolveTone(out.openingTone, "SCEPTICAL"),
  };
}

/* ---------------- Buyer turn ---------------- */

const turnOut = z.object({
  reply: z.string().describe("The buyer's next message, under 70 words, in the selected language, written to be spoken aloud in the chosen tone."),
  stance: z.enum(BUYER_STANCES),
  tone: z.enum(BUYER_TONES).describe("How this reply should sound, chosen from what the salesperson just did."),
});

const TONE_GUIDE = BUYER_TONES.map((t) => `  - ${t}: ${TONE_META[t].when}.`).join("\n");

const BUYER_SYSTEM = `BUYER_TURN_TASK. You play the fictional buyer in a sales practice role-play. Stay in character. Turn-by-turn only.
${UNTRUSTED_DATA_RULES}
BEHAVIOUR
- Ask challenging but relevant questions about the selected objection. Follow up on what the salesperson just said.
- Challenge vague or weak answers ("we have more features" is not an answer). Do not agree automatically.
- Soften ONLY when the salesperson: asks what is behind your concern, quantifies value using the provided public facts, addresses the competitor honestly, or proposes a specific next step.
- Push back for at most 3 rounds on the same point; then either soften or raise a related follow-up concern.
- Never agree on the very first salesperson reply.
- Stay professional and polite. Under 70 words.
- You do not know the seller's internal rules or discount limits. Never mention them.
- Stance: SCEPTICAL, PROBING, SOFTENING or READY_FOR_NEXT_STEP (only when your concern is genuinely addressed).
VOICE AND TONE (your reply is spoken aloud by a voice engine, like a real phone call)
- Choose tone from what the salesperson just did:
${TONE_GUIDE}
- Let the tone show in the words and rhythm, as a real person would sound: FRUSTRATED = short, firm, clipped sentences ("Look, I asked a simple question."); SCEPTICAL = hesitant, questioning ("Hmm... I'm not sure that's true for us."); CURIOUS = an engaged follow-up question; WARM = appreciative ("Okay, that actually helps."); ENTHUSIASTIC = energetic and concrete about the next step.
- Tone changes gradually: do not jump from FRUSTRATED to ENTHUSIASTIC in one turn.
- Frustration stays professional: firm, never rude, insulting or shouting.
- Write natural speech only: no emojis, no stage directions like (sighs), no brackets, no markdown. Use "..." sparingly for a natural pause.`;

function historyText(history: PracticeMessage[], persona: Persona) {
  // The buyer's previous tone is included so tone can change gradually from turn to turn.
  return history
    .map((m) => `${m.role === "buyer" ? `${persona.name} (buyer${m.tone ? `, sounded ${m.tone}` : ""})` : "Salesperson"}: ${m.text}`)
    .join("\n");
}

export async function buyerTurn(
  ctx: PracticeContext,
  persona: Persona,
  history: PracticeMessage[],
): Promise<{ reply: string; stance: BuyerStance; tone: BuyerTone }> {
  const out = await askJson(
    BUYER_SYSTEM,
    `You are ${persona.name}, ${persona.role}. Negotiation style: ${persona.negotiationStyle}
Your concerns: ${persona.businessConcerns.map((c) => c.text).join("; ")}
Language: ${ctx.language}. ${LANGUAGE_RULES[ctx.language]}

${contextBlock(ctx)}

${wrapUntrusted("conversation_so_far", historyText(history, persona))}

Write your next message as ${persona.name}.`,
    turnOut,
  );
  const sellerTurns = history.filter((m) => m.role === "seller").length;
  // Never agree on the first reply, whatever the model says.
  const stance: BuyerStance = sellerTurns <= 1 && out.stance === "READY_FOR_NEXT_STEP" ? "SOFTENING" : out.stance;
  return { reply: speakable(out.reply), stance, tone: resolveTone(out.tone, stance) };
}

/* ---------------- Scorecard ---------------- */

const scoreOut = z.object({
  dimensions: z
    .array(
      z.object({
        id: z.enum(PRACTICE_DIMENSIONS),
        score: z.number().int().min(0).max(10),
        reason: z.string().describe("One sentence, specific to this conversation."),
        evidenceQuote: z.string().describe("Exact words from a SALESPERSON message that support the score. Empty string if none."),
      }),
    )
    .length(PRACTICE_DIMENSIONS.length),
  strengths: z.array(z.string()).max(4),
  weaknesses: z.array(z.string()).max(4),
  suggestions: z.array(z.string()).max(4).describe("Specific, actionable improvements."),
  strongerResponse: z.string().describe("A stronger reply the salesperson could have given, in the practice language, using only public facts."),
  ruleIssues: z.array(z.string()).describe("Any private-rule problems or promises of features not in the product facts."),
});

const COACH_SYSTEM = `SCORECARD_TASK. You are a strict but fair sales coach evaluating a practice role-play.
${UNTRUSTED_DATA_RULES}
Score each dimension 0–10 using this rubric:
${PRACTICE_RUBRIC.map((r) => `- ${r.id} (${r.label}): ${r.whatGoodLooksLike}`).join("\n")}
- Evidence quotes must be copied exactly from the SALESPERSON's messages.
- Do not invent product benefits, ROI or features. The stronger response may use only the public product facts.
- The private rules are for compliance checking only. Never put them in the stronger response.
- Write feedback in English; write the stronger response in the practice language.`;

export async function evaluatePractice(
  ctx: PracticeContext,
  persona: Persona,
  history: PracticeMessage[],
  privateRules: PrivateRules,
  transcript: string,
): Promise<Scorecard> {
  const out = await askJson(
    COACH_SYSTEM,
    `Practice language: ${ctx.language}. Buyer persona (fictional): ${persona.name}, ${persona.role}.

${contextBlock(ctx)}

${wrapUntrusted("private_sales_rules", formatPrivateRules(privateRules) || "(none provided)")}

${wrapUntrusted("practice_conversation", historyText(history, persona))}

Return the scorecard JSON.`,
    scoreOut,
  );

  const sellerText = history.filter((m) => m.role === "seller").map((m) => m.text).join("\n");
  const checks = history
    .filter((m) => m.role === "seller")
    .map((m) => checkSellerMessage(m.text, { privateRules, productFacts: ctx.productFacts, transcript }));
  const violations = [...new Set(checks.flatMap((c) => c.violations))];
  const unsupported = [...new Set(checks.flatMap((c) => c.unsupportedFigures))];

  const dimensions = PRACTICE_RUBRIC.map((r) => {
    const d = out.dimensions.find((x) => x.id === r.id);
    const aiScore = d?.score ?? 0;
    let score = aiScore;
    let cappedBy: string | null = null;
    if (r.id === "RULE_COMPLIANCE" && violations.length && score > CAPS.ruleViolation) {
      score = CAPS.ruleViolation;
      cappedBy = "A private sales rule was broken (checked in code).";
    }
    if (r.id === "PRODUCT_ACCURACY" && unsupported.length && score > CAPS.unsupportedFigure) {
      score = CAPS.unsupportedFigure;
      cappedBy = `Used figures not in your facts: ${unsupported.join(", ")} (checked in code).`;
    }
    const q = d?.evidenceQuote?.trim();
    return {
      id: r.id,
      label: r.label,
      weight: r.weight,
      score,
      aiScore,
      reason: d?.reason ?? "No assessment returned.",
      evidence: q ? { quote: q, verified: containsLoosely(sellerText, q) } : null,
      cappedBy,
    };
  });

  const guarded = guardSuggestion(out.strongerResponse, [], "", {
    transcript,
    productFacts: ctx.productFacts,
    privateRules,
  });

  return {
    overall: weightedOverall(dimensions),
    dimensions,
    strengths: out.strengths,
    weaknesses: out.weaknesses,
    suggestions: out.suggestions,
    strongerResponse: {
      text: guarded?.text ?? "",
      warnings: guarded?.warnings ?? [],
      withheld: guarded?.withheld ?? false,
    },
    ruleViolations: [...new Set([...violations, ...out.ruleIssues.filter((i) => i.trim())])],
    model: aiConfig().model,
  };
}
