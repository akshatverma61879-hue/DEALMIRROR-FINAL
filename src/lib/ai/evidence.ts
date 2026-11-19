/**
 * Verifies that quotes returned by the model really exist in the transcript.
 * Matching ignores case, spacing and quote/dash styles, but the text shown to the user is
 * always the exact slice of the original transcript, so quotations are never altered.
 */
import type { Evidence } from "../types";

const CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "″": '"',
  "–": "-", "—": "-", "‒": "-", "−": "-",
  " ": " ", " ": " ", " ": " ",
};

interface Normalised {
  text: string;
  /** map[i] = index in the original string of normalised char i */
  map: number[];
}

function normalise(original: string): Normalised {
  const nfc = original.normalize("NFC");
  let text = "";
  const map: number[] = [];
  let lastWasSpace = true;
  // NFC rarely changes length for our scripts; index into nfc and treat it as the original.
  for (let i = 0; i < nfc.length; i++) {
    let ch = CHAR_MAP[nfc[i]] ?? nfc[i];
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      ch = ch.toLowerCase();
    }
    text += ch;
    map.push(i);
  }
  return { text, map };
}

export interface TranscriptIndex {
  original: string;
  norm: Normalised;
  lineStarts: number[];
}

export function indexTranscript(transcript: string): TranscriptIndex {
  const original = transcript.normalize("NFC");
  const lineStarts = [0];
  for (let i = 0; i < original.length; i++) if (original[i] === "\n") lineStarts.push(i + 1);
  return { original, norm: normalise(original), lineStarts };
}

function lineOf(idx: TranscriptIndex, pos: number) {
  let lo = 0;
  let hi = idx.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (idx.lineStarts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Strip wrapping quote marks and a leading "Speaker:" label the model may have copied. */
function cleanQuote(q: string) {
  return q
    .trim()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "")
    .replace(/^[^:\n]{1,40}:\s+/, (m, offset, whole) => (whole.length > m.length + 3 ? "" : m))
    .trim();
}

/**
 * Locates a quote. Supports "…" / "..." ellipses: every segment must appear in order.
 * Returns null for an empty quote.
 */
export function verifyQuote(idx: TranscriptIndex, raw: string): Evidence | null {
  const q = cleanQuote(raw ?? "");
  if (!q) return null;

  const segments = q
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((s) => normalise(s).text.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  let from = 0;
  const spans: [number, number][] = [];
  for (const seg of segments) {
    const at = idx.norm.text.indexOf(seg, from);
    if (at === -1) {
      return { quote: q, verified: false, line: null, start: null, end: null };
    }
    spans.push([idx.norm.map[at], idx.norm.map[at + seg.length - 1] + 1]);
    from = at + seg.length;
  }

  const start = spans[0][0];
  const end = spans[spans.length - 1][1];
  const exact = spans.map(([a, b]) => idx.original.slice(a, b)).join(" … ");
  return { quote: exact, verified: true, line: lineOf(idx, start), start, end };
}

/** Case/spacing-insensitive containment, used to check that a claim came from the user's impression. */
export function containsLoosely(haystack: string, needle: string) {
  const n = normalise(cleanQuote(needle)).text.replace(/[.!?,;]+$/, "").trim();
  if (!n) return false;
  return normalise(haystack).text.includes(n);
}
