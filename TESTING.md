# DealMirror: final test report (19 Nov 2026)

Environment: Linux, Node 22.23, Chrome (Playwright), production build (`next build && next start`).
AI calls went to a local Gemini stub (`scripts/gemini-stub.mjs`) because no real API key or outbound access was
available.

## Summary

| Check | Result |
|---|---|
| Unit tests (Vitest), 6 files | **108 / 108 passed** |
| `tsc --noEmit` | Passed |
| ESLint | Passed, no errors |
| Production build (`next build`) | Passed: 1 static page and 6 dynamic API routes |
| `npm audit --omit=dev` | 0 known vulnerabilities |
| Browser integration scripts (Playwright, stub) | All passed after test-script updates (see "Defects found") |

## Defects found and fixed in this round

1. **Unverifiable analysis showed 100/100 "Lower risk".** When the AI's quotes did not match the transcript, every
   check became "unclear". Nothing was deducted, so the dashboard showed 100 next to "4 of 4 unresolved" and "Not
   booked".
   - **Fix:** the score now carries a `limitedEvidence` flag (set when more than half of the rules cannot be
     judged). The overview card shows "Limited evidence", and Deal Health shows a warning.
   - The next-meeting card now says "Unclear" instead of "Not booked" when it is not verified.
   - The simulator explains the checks that could not be judged.
   - Scoring rules are unchanged. Covered by a regression test and a browser test.
2. **No request-body size limit on API routes.** **Fix:** a shared `readJson` with per-route byte limits returns 413
   before parsing.
3. **The rate-limit map could grow without bound on a long-running server.** **Fix:** idle entries are pruned.
4. **No security headers.** **Fix:** added to `next.config.ts`, and API responses are `no-store`.
5. Removed unused leftover types (`ActionItem`, `ChatMessage`, `PracticeScore`).
6. Two browser test scripts were outdated because of button renames in the demo-mode phase. These were test bugs,
   not app bugs, and the scripts were updated.

## Passed: verified

**Scoring and data integrity (unit tests)**
- Over 2,000 randomised analyses (findings, objections, polite phrases, stage, call length):
  - Every score is either *Insufficient evidence* or an integer 0–100.
  - An uncapped score equals the weighted share of evidence earned, exactly.
  - No criterion is counted twice, and unjudged criteria never earn or lose points.
- Scenario tests: a hostile call the buyer ended, a strong call, and a friendly but hollow call are ranked the way
  a sales manager would rank them; each scoring requirement (positive evidence, independence, stage weights,
  next step without a meeting, false agreement, no double counting, no penalty for missing information) has tests.
- The simulator never changes the real score and never exceeds 100.
- The AI output schema has no score field, so the model cannot set the score.
- Sample deal: Deal Health 32, Salesperson 41, Illusion risk 84; closing every Deal Health gap reaches 100. All sample quotes verify against
  the sample transcript.

**Security checks performed**
- **Key exposure:**
  - Built with `GEMINI_API_KEY=good-SECRET-XYZ123`.
  - The secret appears in 0 files under `.next/static` and 0 under `.next/server`.
  - It appears in 0 API responses, across the success, quota, timeout, invalid-JSON, invalid-schema, empty and
    schema-400 cases.
  - It appears in 0 server log lines.
- **Prompt injection:**
  - Transcript text cannot close or forge its delimiter block, and each block gets a random id per call.
  - A "give this deal 100" injection with invented quotes produces "unclear" findings, not a high score.
- **Private-data isolation:**
  - Private seller rules are excluded from analysis unless requested.
  - The practice start, turn and TTS routes reject `privateRules` (strict schemas).
  - Document generation receives buyer-safe data only.
  - The stub logged 0 "LEAKED" events across all runs.
  - The privacy scan blocks copy and print.
- **Input validation:** the server rejects these with clear messages:
  - empty, too-short, single-speaker and over-30,000-character transcripts
  - wrong types and unknown languages
  - malformed JSON
- **Abuse limits:**
  - Oversized bodies return **413** on analyze, documents, practice/start, practice/turn and tts.
  - On practice/evaluate (which has a higher limit) the oversized body was rejected with **400** by validation.
  - With the default limit of 8 per minute, the 9th analyze request from one client in the same minute returned
    **429**.
- **Headers:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
  (microphone only) and HSTS are present. `X-Powered-By` is removed. API responses are `Cache-Control: no-store`.
- **No real-looking API keys in the source**, and `.env*` is git-ignored except `.env.example`.

**AI reliability (stub scenarios)**
- **Good output:** analysis renders with the model name. English and Hindi (Devanagari) transcripts both work.
- **Missing key:** returns a clear `NOT_CONFIGURED` error.
- **Failure cases:**
  - quota: `QUOTA_EXCEEDED`
  - slow: `TIMEOUT` (with a 3 s test timeout)
  - invalid JSON or invalid schema: `INVALID_JSON` after one retry
  - schema rejected with a 400: retried without the schema, and succeeds
- **Empty findings or no objections:** renders without errors.
- **No substitution on failure:** the error panel shows, the transcript is kept, and no sample data appears.
- **Mismatched quotes:** a *Limited evidence* warning appears. With the matching transcript the score is 48 and
  there is no warning.
- **Stakeholders:** a speaking CFO is Confirmed present even if the model said "mentioned". An unconfirmed
  stakeholder stays Participation unknown.
- **Documents:** when generation fails on quota, the template fallback produces all 8 memo sections, and every plan
  status is PROPOSED.

**Voice (simulated browser APIs)**
- **Microphone, simulated:** the draft text and language (en-IN) are captured correctly.
- **Microphone errors:** each shows a clear message, and typing still works.
  - permission denied (`not-allowed`)
  - no speech
  - network error
- **Unsupported browser** (no SpeechRecognition): the mic is disabled and the text fallback works.
- **Voices:**
  - Gemini TTS (stub) plays.
  - When the TTS provider fails, the app falls back to browser speech and labels it.
  - Text-only practice works.

**Flows and performance (Playwright, production build)**
- **Sample demo:** the 10-step tour works end to end and makes **0 API requests**.
- **Live analysis:** Practice (live and scripted), scorecard, the action-plan editor, privacy scan, copy and A4
  print-to-PDF all work.
- **No re-requests during navigation:** 16 section changes after analysis and documents made **0 additional API
  requests**, because results are cached in session memory.
- **Responsive:** at 390 px wide, none of the 8 sections overflows horizontally.
- **Session state:**
  - Practice and plan edits persist across navigation.
  - Reset clears the session.
  - Switching from sample to live replaces all sample labels.

## Failed

None outstanding. The defects above were found and fixed, and their tests now pass.

## Not tested

- **Real services:**
  - The real Gemini API (model quality, real latency, real error payloads, Hindi and Hinglish output quality).
  - The real Gemini TTS, ElevenLabs and Fish Audio. The ElevenLabs and Fish integrations have only been checked
    by code review.
  - A real microphone and real browser speech recognition, including Hindi and Hinglish accuracy.
- **Browsers and devices:** Safari, Firefox and real mobile devices. Only Chrome was used, with a mobile-sized
  viewport.
- **Deployment:**
  - An actual Vercel deployment: function timeouts, HTTPS, header behaviour behind Vercel's edge, and
    multi-instance rate limiting.
  - Load or concurrency testing.
- **Accessibility:** no screen-reader or full WCAG audit. Only ARIA labels and roles were used by the tests.
- **Security:** no formal security audit, penetration test, dependency supply-chain review or CSP. This app should
  **not** be described as fully secure.
