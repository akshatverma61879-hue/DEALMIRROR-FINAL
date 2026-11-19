// Local stand-in for the Sarvam AI REST API (chat, text-to-speech, speech-to-text), for testing only. Behaviour is chosen by the API key.
import http from "node:http";
const nova = {
  dealName: "Nova Retail",
  callSummary: "Arjun demoed SalesPro; Rohit raised price vs ReportRight and said Meera must approve. No next meeting.",
  buyerProblem: "Two days every month preparing store reports in Excel.",
  objections: [
    { id: "obj-1", category: "PRICING", title: "Price feels high", buyerConcernQuote: "But honestly, ₹5 lakh a year is expensive.", sellerResponseQuote: "Sir, SalesPro has many more features than ReportRight, and our interface is much better.", buyerFollowUpQuote: "Okay. Hmm. We have 18 stores. Would setup take long?", explanation: "Features listed instead of value.", status: "UNANSWERED_OR_AVOIDED", confidence: "high", isInferred: false,
      suggestedResponse: "Rohit sir, I can offer 15% discount today if you sign this week.", suggestedResponseBasedOn: ["Private rules"], clarifyingQuestion: "What does the ₹3 lakh quote include?" },
    { id: "obj-2", category: "COMPETITION", title: "Cheaper competitor", buyerConcernQuote: "ReportRight quoted us ₹3 lakh.", sellerResponseQuote: "Sir, SalesPro has many more features than ReportRight", buyerFollowUpQuote: "", explanation: "No like-for-like comparison.", status: "UNANSWERED_OR_AVOIDED", confidence: "high", isInferred: false,
      suggestedResponse: "Customers usually save ₹12 lakh a year with SalesPro, guaranteed.", suggestedResponseBasedOn: [], clarifyingQuestion: "" },
    { id: "obj-3", category: "STAKEHOLDER_APPROVAL", title: "Finance head approval", buyerConcernQuote: "Meera ma’am, our finance head, has to approve anything above ₹3 lakh", sellerResponseQuote: "Sure sir, of course.", buyerFollowUpQuote: "Okay, sounds good. We will think about it and let you know.", explanation: "Approver not engaged.", status: "POSSIBLY_UNRESOLVED", confidence: "high", isInferred: false,
      suggestedResponse: "Could I join a 30-minute call with Meera ma'am this week? Three customers cut reporting time by 40%.", suggestedResponseBasedOn: ["Verified benefit"], clarifyingQuestion: "" },
    { id: "obj-4", category: "IMPLEMENTATION", title: "Fabricated concern", buyerConcernQuote: "We are worried about data security on your cloud.", sellerResponseQuote: "", buyerFollowUpQuote: "", explanation: "Test of an invented quote.", status: "UNKNOWN", confidence: "low", isInferred: true, suggestedResponse: "", suggestedResponseBasedOn: [], clarifyingQuestion: "Ask whether security review is needed." }
  ],
  illusions: [
    { id: "ill-1", objectionId: "obj-1", politePhraseQuote: "Okay, sounds good. We will think about it and let you know.", buyerConcernQuote: "₹5 lakh a year is expensive", sellerResponseQuote: "SalesPro has many more features than ReportRight", buyerFollowUpQuote: "Okay, sounds good. We will think about it and let you know.", addressed: "Features.", unconfirmed: "Whether price is acceptable.", falseConfidence: "Polite close, no commitment.", clarificationToSeek: "Ask what would make the price work.", uncertainty: "medium" }
  ],
  realityCheck: [
    { claim: "price is not a real problem", evidenceQuote: "₹5 lakh a year is expensive.", verdict: "CONTRADICTED", explanation: "Buyer called it expensive." },
    { claim: "The CFO signed the contract", evidenceQuote: "", verdict: "CONTRADICTED", explanation: "Manufactured claim (should be dropped)." },
    { claim: "Rohit is very interested", evidenceQuote: "Looks good.", verdict: "NOT_CONFIRMED", explanation: "Interest shown but no commitment." }
  ],
  stakeholders: [
    { name: "Arjun", role: "Sales", side: "seller", status: "CONFIRMED_PRESENT", quote: "Good morning Rohit sir" },
    { name: "Rohit", role: "Buyer", side: "buyer", status: "CONFIRMED_PRESENT", quote: "Looks good." },
    { name: "Meera", role: "Finance head", side: "buyer", status: "CONFIRMED_PRESENT", quote: "Meera ma'am, our finance head" },
    { name: "CEO", role: "Chief executive", side: "buyer", status: "MENTIONED_ONLY", quote: "Our CEO signs off on all software." }
  ],
  relationships: [
    { from: "Meera", to: "Rohit", type: "APPROVES", quote: "our finance head, has to approve anything above ₹3 lakh" },
    { from: "CEO", to: "Meera", type: "REPORTS_TO", quote: "Meera reports to the CEO." }
  ],
  findings: {
    buyer_problem_confirmed: { value: "unclear", quote: "" },
    buying_signal: { value: "yes", quote: "Looks good." },
    buyer_commitment: { value: "no", quote: "" },
    next_step_agreed: { value: "no", quote: "Please let me know whenever you are ready." },
    decision_maker_required: { value: "yes", quote: "has to approve anything above ₹3 lakh" },
    decision_maker_engaged: { value: "no", quote: "Sure sir, of course." },
    budget_or_timeline_discussed: { value: "no", quote: "The budget was approved last week." },
    buyer_rejected: { value: "no", quote: "" },
    competitor_mentioned: { value: "yes", quote: "ReportRight quoted us ₹3 lakh." },
    discovery_questions_asked: { value: "no", quote: "" },
    value_linked_to_need: { value: "no", quote: "" },
    buyer_questions_answered: { value: "unclear", quote: "" },
    competitor_addressed: { value: "no", quote: "" },
    unsupported_claims_made: { value: "yes", quote: "Sir, SalesPro has many more features than ReportRight" },
    seller_asked_for_next_step: { value: "no", quote: "Please let me know whenever you are ready." }
  },
  salesStage: { stage: "EVALUATION", quote: "Looks good." }
};
const empty = { ...nova, objections: [], illusions: [], realityCheck: [], callSummary: "Friendly check-in call." };
const hindi = { ...empty, dealName: "Gupta Logistics", objections: [
  { id: "o1", category: "PRICING", title: "कीमत ज़्यादा", buyerConcernQuote: "ठीक है, लेकिन थोड़ा महंगा लग रहा है।", sellerResponseQuote: "सर, हमारे फीचर्स बहुत ज़्यादा हैं।", buyerFollowUpQuote: "", explanation: "Features listed, value not explored.", status: "UNANSWERED_OR_AVOIDED", confidence: "high", isInferred: false, suggestedResponse: "संदीप जी, 1.8 लाख वाले वेंडर में क्या-क्या शामिल है?", suggestedResponseBasedOn: [], clarifyingQuestion: "" } ] };

const reply = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
// Includes an inline reasoning trace, which the client must strip before parsing.
const ok = (res, obj, raw) => reply(res, 200, { id: "stub", object: "chat.completion", model: "sarvam-105b", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", reasoning_content: "thinking...", content: "<think>thinking...</think>\n" + (raw ?? JSON.stringify(obj)) } }] });
function wavBase64() {
  const rate = 24000, n = rate / 2, pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]).toString("base64");
}
http.createServer((req, res) => {
  const parts = []; req.on("data", (c) => parts.push(c)); req.on("end", () => {

    const key = String(req.headers["api-subscription-key"] || "").split("-")[0];
    const raw = Buffer.concat(parts);
    if (key === "bad") return reply(res, 403, { error: { message: "Invalid API subscription key", code: "invalid_api_key_error", request_id: "stub" } });
    if (key === "quota") return reply(res, 429, { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded_error", request_id: "stub" } });
    // ---- Voice: speech-to-text (multipart) ----
    if (req.url.startsWith("/speech-to-text")) {
      console.log(`[stub] ${req.url} key=${key} bytes=${raw.length}`);
      if (key === "sttfail") return reply(res, 500, { error: { message: "STT failed" } });
      const lang = (raw.toString("latin1").match(/name="language_code"\r\n\r\n([a-z-]+-IN)/i) || [])[1] || "en-IN";
      return reply(res, 200, { request_id: "stub", transcript: lang === "hi-IN" ? "सर, ReportRight के ₹3 लाख में क्या शामिल है?" : "Could you share what ReportRight's quote includes for 18 stores?", language_code: lang });
    }
    const payload = JSON.parse(raw.toString("utf8") || "{}");
    // ---- Voice: text-to-speech ----
    if (req.url.startsWith("/text-to-speech")) {
      console.log(`[stub] ${req.url} key=${key} lang=${payload.language_code} speaker=${payload.speaker} chars=${payload.text?.length}`);
      if (key === "ttsfail") return reply(res, 429, { error: { message: "TTS quota exceeded" } });
      return reply(res, 200, { request_id: "stub", audios: [wavBase64()] });
    }
    // ---- LLM: chat completions ----
    const hasSchema = payload.response_format?.type === "json_schema";
    const sys = payload.messages?.find((m) => m.role === "system")?.content ?? "";
    const user = payload.messages?.find((m) => m.role === "user")?.content ?? "";
    console.log(`[stub] ${req.url} key=${key} model=${payload.model} schema=${hasSchema} sysChars=${sys.length} userChars=${user.length}`);
    if (key === "slow") return setTimeout(() => ok(res, nova), 8000);
    if (key === "badjson") return ok(res, null, "Sure! Here is the analysis: {not json");
    if (key === "badschema") return ok(res, { hello: "world" });
    if (key === "empty") return ok(res, empty);
    if (key === "schema400" && hasSchema) return reply(res, 400, { error: { message: "Unsupported schema keyword", code: "invalid_request_error" } });
    // ---- Practice ----
    const lang = (user.match(/Language: (English|Hindi|Hinglish)/) || [])[1] || "English";
    if (sys.startsWith("PERSONA_TASK")) {
      if (user.includes("private_sales_rules") || /walk-away|Maximum discount/i.test(user)) console.log("[stub] !!! PRIVATE RULES LEAKED TO PERSONA");
      const opening = { English: "Arjun, honestly ₹5 lakh still feels high when ReportRight quoted ₹3 lakh. Why should we pay ₹2 lakh more?", Hindi: "देखिए, ₹5 लाख अभी भी ज़्यादा लग रहा है, ReportRight ने ₹3 लाख बोला है। हम ₹2 लाख ज़्यादा क्यों दें?", Hinglish: "Dekhiye, ₹5 lakh abhi bhi zyada lag raha hai. ReportRight ne ₹3 lakh quote kiya hai, toh hum ₹2 lakh extra kyun dein?" }[lang];
      return ok(res, { name: key === "clash" ? "Rohit Sharma" : "Vikram Mehta", role: "Head of Retail Operations", businessConcerns: [ { text: "Price gap vs a ₹3 lakh competitor quote", source: "TRANSCRIPT" }, { text: "Finance head approval above ₹3 lakh", source: "TRANSCRIPT" }, { text: "Wants proof the 40% time saving applies to 18 stores", source: "SIMULATED" } ], negotiationStyle: "Polite but data-driven; compares vendors line by line.", objectionSummary: "Believes SalesPro is overpriced compared with ReportRight.", openingMessage: opening });
    }
    if (sys.startsWith("BUYER_TURN_TASK")) {
      if (/walk-away|Maximum discount|private_sales_rules/i.test(user)) console.log("[stub] !!! PRIVATE RULES LEAKED TO BUYER");
      const lastSeller = (user.match(/Salesperson: (.*)\n?[^\n]*<<<END:CONVERSATION/s) || [])[1] || "";
      const strong = /\?/.test(lastSeller) && /\d/.test(lastSeller);
      const turns = (user.match(/Salesperson:/g) || []).length;
      const replies = {
        English: strong ? "That's a fairer comparison. ReportRight's quote is for 10 users only. If the 40% holds for our 18 stores, I could take it to Meera — what would you need from us?" : "Every vendor says they have more features. That doesn't tell me why we should pay ₹2 lakh more. What exactly do we get for the difference?",
        Hindi: strong ? "हाँ, ये तुलना ठीक है। अगर 18 स्टोर्स पर 40% समय बचता है, तो मैं मीरा जी से बात कर सकता हूँ।" : "हर वेंडर यही कहता है कि उनके फीचर्स ज़्यादा हैं। ₹2 लाख ज़्यादा किस चीज़ के लिए?",
        Hinglish: strong ? "Haan, yeh comparison fair hai. Agar 18 stores pe 40% time bachta hai, toh main Meera ma'am se baat kar sakta hoon. Aapko humse kya chahiye?" : "Har vendor yahi bolta hai ki features zyada hain. Par ₹2 lakh extra kis cheez ke liye dein, yeh clear nahi hai.",
      };
      return ok(res, { reply: replies[lang], stance: strong ? (turns <= 1 ? "READY_FOR_NEXT_STEP" : "SOFTENING") : "SCEPTICAL" });
    }
    if (sys.startsWith("SCORECARD_TASK")) {
      const sellerLines = [...user.matchAll(/Salesperson: (.*)/g)].map((m) => m[1]);
      const q = (sellerLines[0] || "").slice(0, 40);
      const dims = ["UNDERSTANDING","OBJECTION_HANDLING","PRODUCT_ACCURACY","VALUE_COMMUNICATION","PROFESSIONALISM","RULE_COMPLIANCE","FOLLOW_UP"].map((id, i) => ({ id, score: [6,5,8,6,9,9,4][i], reason: `Stub assessment for ${id.toLowerCase()}.`, evidenceQuote: i === 6 ? "I will send the contract tomorrow." : q }));
      return ok(res, { dimensions: dims, strengths: ["Stayed polite and calm under pushback."], weaknesses: ["Did not ask what the competitor quote includes."], suggestions: ["Ask a discovery question before defending price."], strongerResponse: lang === "Hinglish" ? "Rohit ji, ReportRight ke ₹3 lakh mein kya-kya included hai? Aapke 18 stores ke liye 40% time saving ka hisaab saath mein nikaalte hain." : "Could you share what ReportRight's ₹3 lakh includes? Then we can work out what a 40% reporting-time saving means across your 18 stores.", ruleIssues: [] });
    }
    if (sys.startsWith("DOCUMENTS_TASK")) {
      if (/walk-away|Maximum discount|private_sales_rules|seller_impression|marketing/i.test(user)) console.log("[stub] !!! PRIVATE DATA LEAKED TO DOCUMENTS");
      const strong = user.includes("Thursday 4 works");
      return ok(res, {
        title: strong ? "Nova Retail × SalesPro · Mutual action plan" : "Nova Retail × SalesPro · Mutual action plan",
        meetingSummary: "Rohit described two days a month spent on Excel store reports and raised price against a ReportRight quote. Meera, the finance head, approves purchases above ₹3 lakh.",
        confirmedDecisions: strong ? [{ text: "Review call with Meera on Thursday at 4 pm", evidenceQuote: "Thursday 4 works. Send the invite." }] : [{ text: "Buyer agreed to proceed", evidenceQuote: "We agreed to sign next week." }],
        openQuestions: ["What does the ReportRight quote include?", "What budget is approved for this purchase?"],
        actionItems: [
          ...(strong ? [{ task: "30-minute review call with Meera", owner: "Kavya", status: "AGREED", dueDate: "Thursday at 4 pm", evidenceQuote: "Thursday 4 works. Send the invite.", justification: "Agreed on the call." }] : []),
          { task: "Share a like-for-like comparison with ReportRight", owner: "Arjun", status: "AGREED", dueDate: "15 December", evidenceQuote: "", justification: "Price concern unresolved." },
          { task: "Confirm current monthly reporting effort", owner: "Rohit", status: "PROPOSED", dueDate: "", evidenceQuote: "", justification: "Needed to size value." },
          { task: "Procurement review", owner: "Procurement team", status: "COMPLETED", dueDate: "", evidenceQuote: "Procurement has already approved.", justification: "x" },
        ],
        memo: {
          businessContext: "Nova Retail runs 18 stores and prepares store reports in Excel. This will deliver 300% ROI in year one.",
          problem: "Store reporting takes almost two days every month.",
          proposedSolution: "Adopt SalesPro for reporting. SalesPro is SOC 2 certified. Customers save ₹12 lakh a year.",
          risksAndQuestions: ["Price is above a ₹3 lakh alternative quote.", "Approval by the finance head is pending.", "Vendor's walk-away price is ₹3.5 lakh."],
          nextSteps: ["Share a like-for-like comparison.", "Schedule a review with the finance head."]
        }
      });
    }
    if (user.includes("संदीप")) return ok(res, hindi);
    return ok(res, nova);
  });
}).listen(4010, () => console.log("[stub] listening on 4010"));
