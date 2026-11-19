import { describe, expect, it } from "vitest";
import { BUYER_TONES, VOICE_STYLE, resolveTone, sarvamVoiceSettings, speakable, toneFromStance } from "../practice/tone";
import { detectVoiceCommand } from "../practice/voice-commands";
import { practiceMessageSchema, ttsRequestSchema, BUYER_STANCES } from "../practice/types";
import { scriptedBuyerReply } from "../practice/scripted";
import { EMPTY_INPUT } from "../input-defaults";
import type { PracticeMessage } from "../practice/types";

describe("buyer tone", () => {
  it("keeps a tone that fits the stance", () => {
    expect(resolveTone("FRUSTRATED", "SCEPTICAL")).toBe("FRUSTRATED");
    expect(resolveTone("ENTHUSIASTIC", "READY_FOR_NEXT_STEP")).toBe("ENTHUSIASTIC");
  });
  it("replaces a tone that contradicts the stance (no enthusiastic sceptic)", () => {
    expect(resolveTone("ENTHUSIASTIC", "SCEPTICAL")).toBe("SCEPTICAL");
    expect(resolveTone("FRUSTRATED", "READY_FOR_NEXT_STEP")).toBe("WARM");
    expect(resolveTone(undefined, "SOFTENING")).toBe("WARM");
  });
  it("every stance has a default tone, and no tone means neutral", () => {
    for (const s of BUYER_STANCES) expect(BUYER_TONES).toContain(toneFromStance(s));
    expect(toneFromStance(undefined)).toBe("NEUTRAL");
  });
  it("voice settings stay inside what each engine accepts", () => {
    for (const t of BUYER_TONES) {
      const v = VOICE_STYLE[t];
      expect(v.rate).toBeGreaterThan(0.5);
      expect(v.rate).toBeLessThan(1.5);
      expect(v.pitch).toBeGreaterThanOrEqual(0);
      expect(v.pitch).toBeLessThanOrEqual(2);
      expect(v.volume).toBeLessThanOrEqual(1);
      const s = sarvamVoiceSettings(t, 1);
      expect(s.pace).toBeGreaterThanOrEqual(0.5);
      expect(s.pace).toBeLessThanOrEqual(2);
      expect(s.temperature).toBeLessThanOrEqual(1); // the API rejects > 1
      expect(s.loudness).toBeGreaterThanOrEqual(0.5);
    }
  });
  it("frustrated sounds faster and louder than warm; the base pace setting is respected", () => {
    expect(sarvamVoiceSettings("FRUSTRATED").pace).toBeGreaterThan(sarvamVoiceSettings("WARM").pace);
    expect(sarvamVoiceSettings("FRUSTRATED").loudness).toBeGreaterThan(sarvamVoiceSettings("WARM").loudness);
    expect(sarvamVoiceSettings("NEUTRAL", 1.2).pace).toBe(1.2);
    expect(sarvamVoiceSettings("NEUTRAL", 9).pace).toBe(1); // invalid base ignored
  });
});

describe("speakable text", () => {
  it("removes stage directions, markdown and emojis a voice would read aloud", () => {
    expect(speakable("(sighs) Look, I asked a *simple* question 😤")).toBe("Look, I asked a simple question");
    expect(speakable("Hmm... [pause] **Okay**, that helps.")).toBe("Hmm... Okay, that helps.");
  });
  it("keeps normal Hindi and Hinglish untouched", () => {
    expect(speakable("देखिए, ₹5 लाख ज़्यादा लग रहा है।")).toBe("देखिए, ₹5 लाख ज़्यादा लग रहा है।");
    expect(speakable("Dekhiye, price thoda zyada hai.")).toBe("Dekhiye, price thoda zyada hai.");
  });
});

describe("spoken commands", () => {
  it.each([
    ["End practice.", "END"],
    ["let's finish the session", "END"],
    ["practice khatam karo", "END"],
    ["प्रैक्टिस ख़त्म करो", "END"],
    ["I'm done", "END"],
    ["Can you repeat that?", "REPEAT"],
    ["Sorry, say that again", "REPEAT"],
    ["dobara boliye", "REPEAT"],
    ["Hold on", "PAUSE"],
    ["ek minute", "PAUSE"],
  ])("%s → %s", (text, cmd) => expect(detectVoiceCommand(text)).toBe(cmd));
  it.each([
    "We can stop the manual uploads once the pilot is live, and your team saves three hours a day.",
    "What would make you comfortable ending your current contract with ReportRight?",
    "Wait, let me explain what the price includes",
    "Our support team will repeat the training for every new store manager you hire.",
  ])("a real answer is never mistaken for a command: %s", (text) => expect(detectVoiceCommand(text)).toBeNull());
});

describe("schemas", () => {
  it("TTS accepts a tone but nothing else beyond text and language", () => {
    expect(ttsRequestSchema.safeParse({ text: "Hello", language: "English", tone: "WARM" }).success).toBe(true);
    expect(ttsRequestSchema.safeParse({ text: "Hello", language: "English", tone: "ANGRY" }).success).toBe(false);
    expect(ttsRequestSchema.safeParse({ text: "Hello", language: "English", tone: "WARM", maxDiscount: "10%" }).success).toBe(false);
  });
  it("practice messages carry an optional tone", () => {
    expect(practiceMessageSchema.safeParse({ id: "a", role: "buyer", text: "Hmm.", stance: "SCEPTICAL", tone: "SCEPTICAL" }).success).toBe(true);
  });
});

describe("scripted (Sample Demo) buyer tone", () => {
  const ctx = { privateRules: EMPTY_INPUT.privateRules, productFacts: EMPTY_INPUT.productFacts, transcript: "" };
  const opening: PracticeMessage = { id: "o", role: "buyer", text: "Too expensive.", stance: "SCEPTICAL", tone: "SCEPTICAL" };
  it("a first weak answer is sceptical; a second weak answer in a row is frustrated", () => {
    const h1: PracticeMessage[] = [opening, { id: "s1", role: "seller", text: "Our product is better." }];
    const r1 = scriptedBuyerReply(h1, "English", ctx);
    expect(r1.tone).toBe("SCEPTICAL");
    const h2: PracticeMessage[] = [...h1, { id: "b1", role: "buyer", text: r1.reply, stance: r1.stance, tone: r1.tone }, { id: "s2", role: "seller", text: "It is really much better." }];
    expect(scriptedBuyerReply(h2, "English", ctx).tone).toBe("FRUSTRATED");
  });
  it("a good answer warms the buyer up", () => {
    const h: PracticeMessage[] = [opening, { id: "s1", role: "seller", text: "What is the quote comparing? Could we do a call with Meera on Thursday?" }];
    expect(["WARM", "CURIOUS"]).toContain(scriptedBuyerReply(h, "English", ctx).tone);
  });
});
