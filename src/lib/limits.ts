/**
 * Input limits — change them here; validation and the UI counters read from this file.
 * Character limits (not words) so Hindi / Devanagari text is measured the same way.
 */
export const LIMITS = {
  transcriptMin: 80,
  transcriptMax: 30_000, // ≈ 5,000 English words; enough for a 45-minute call
  minSpeakers: 2,
  shortField: 200, // names, price, competitor names
  mediumField: 600, // features, target customers, offers, rules
  longField: 1_500, // descriptions, benefits, instructions
  impressionMax: 1_500,
} as const;
