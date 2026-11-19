/**
 * Spoken commands during voice practice, so the salesperson never has to touch the keyboard.
 * Only short utterances count as commands, so a real answer that happens to contain "stop"
 * ("we can stop the manual uploads") is still sent to the buyer.
 */
export type VoiceCommand = "END" | "REPEAT" | "PAUSE";

const MAX_COMMAND_WORDS = 6;

const PATTERNS: [VoiceCommand, RegExp][] = [
  // "end practice", "finish the session", "stop the role play", "practice khatam karo", "प्रैक्टिस ख़त्म"
  ["END", /\b(end|finish|stop|close)\b.*\b(practice|session|role ?play|call|training)\b|\b(practice|session|call)\b.*\b(khatam|khatm|band|end|over|done)\b|(प्रैक्टिस|सेशन|कॉल).*(ख़त्म|खत्म|बंद)|^(i'?m )?done( now)?$/],
  // "repeat that", "say that again", "come again", "dobara bolo", "phir se boliye", "फिर से"
  ["REPEAT", /\b(repeat|say (that|it) again|come again|pardon|didn'?t (hear|catch))\b|\b(dobara|phir se|fir se)\b.*\b(bolo|boliye|bataiye|kaho)\b|(दोबारा|फिर से).*(बोलिए|बोलो|कहिए)/],
  // "pause", "hold on", "wait a minute", "ruko", "ek minute"
  ["PAUSE", /^(pause|hold on|wait|wait a (minute|moment|second)|one (minute|moment|second)|ruko|ruk jao|ek minute|एक मिनट|रुको)$/],
];

export function detectVoiceCommand(text: string): VoiceCommand | null {
  const t = text.toLowerCase().replace(/['’]/g, "").replace(/[.,!?।"]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > MAX_COMMAND_WORDS) return null;
  for (const [cmd, re] of PATTERNS) if (re.test(t)) return cmd;
  return null;
}
