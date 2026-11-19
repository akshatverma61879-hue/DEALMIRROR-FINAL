# DealMirror

## 1. What it does

DealMirror is a sales-call coach for small Indian B2B sales teams. You paste a call transcript. It shows what the
buyer actually said, which objections are still open, and where the seller only *thinks* the buyer agreed. It also
shows who is missing from the deal. You can then practise the hard moment with an AI buyer and generate buyer-safe
follow-up documents.

Three scores (Deal Health, Salesperson Performance and Illusion of Agreement Risk) are rule-based coaching scores
calculated in code from verified transcript quotes. They are not win probabilities.

## 2. Key features

- **Deal input:** transcript (English, Hindi or Hinglish), product facts, private seller rules and your own impression.
  Validated with Zod and held in browser memory only, with no database and no localStorage.
- **AI Intelligence (Sarvam AI):**
  - Objections, Illusion of Agreement and a Reality Check.
  - Every quote is verified against the transcript and shown with its line number.
- **Scores (rubrics in `src/lib/scoring-rubric.ts`, maths in `src/lib/scoring.ts`):**
  - **Deal Health:** buyer-side evidence: confirmed problem, buying signals, commitments, a mutually agreed next
    step (any concrete action, not only a meeting), resolved objections, decision-maker access, budget/timeline.
  - **Salesperson Performance:** discovery, value tied to the buyer's need, answering questions, objection
    handling, competitor handling, unsupported claims (penalty-only) and asking for a next step.
  - **Illusion of Agreement Risk** (higher = worse): polite agreement without commitment, open objections, the
    seller's impression contradicted by the transcript, and positive talk with no agreed next step.
  - Each score = 100 × Σ(weight × value) ÷ Σ(judged weight). Positive evidence earns points; nothing starts at 100.
  - Weights adapt to the sales stage (discovery / evaluation / negotiation), detected with a verified quote.
  - Criteria without verified evidence are left out, not penalised. Below 50% coverage a score shows
    *Insufficient evidence* instead of a number. A short call cannot prove that something never happened.
  - An explicit buyer rejection caps Deal Health at 10 (and Illusion risk at 15: the disagreement was explicit).
  - No double counting: within a score each finding is read by one criterion, enforced by a test.
- **Stakeholder Radar:** who spoke, who was only mentioned, and who is unknown, based on speaker labels.
- **Risk Simulator:** a hypothetical Deal Health if its gaps were closed. The real score never changes.
- **AI Buyer Practice:**
  - A persona-based buyer that speaks English, Hindi or Hinglish.
  - **Voice practice, no typing needed:** one "Start voice practice" button runs a call-style loop. The buyer
    speaks, the mic opens, your answer is sent when you pause, and the buyer replies. Silence re-listens twice and
    then pauses. You can interrupt the buyer, and say "repeat that" / "dobara boliye", "pause" or "end practice"
    (which also reads the scorecard summary aloud). Typing stays available behind "Type instead".
  - **Tone that follows the conversation:** each buyer reply is frustrated, sceptical, curious, neutral, warm or
    enthusiastic, chosen from what the salesperson just did and checked in code against the buyer's stance
    (`src/lib/practice/tone.ts`). The tone shapes the wording and the voice (Sarvam pace, loudness and
    expressiveness; ElevenLabs/Fish settings; browser speed, pitch and volume).
  - Optional microphone (Sarvam Saaras speech-to-text, with browser speech recognition as fallback), and optional
    buyer voice (Sarvam Bulbul TTS, ElevenLabs or Fish Audio, with browser speech as fallback).
  - Private-rule compliance flags and a weighted scorecard.
- **Mutual Action Plan and CFO memo:**
  - Generated from buyer-safe data only.
  - A privacy scan blocks copy and print if a private figure appears.
  - A template fallback works when AI is unavailable.
  - Prints to A4 PDF.
- **Try Sample Deal:**
  - A fictional, pre-computed demo (Deal Health 32, Salesperson 41, Illusion risk 84) with a 10-step guided tour.
  - It makes no API calls.
  - It is clearly labelled "Sample Demo — Fictional Data".

## 3. Tech stack

- **App:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4.
- **Libraries:** Radix primitives, Recharts, React Flow (@xyflow/react) and Zod 4.
- **AI and voice:** Sarvam AI REST API: chat completions (`sarvam-105b`, JSON output with schema), Bulbul
  text-to-speech and Saaras speech-to-text. Optional TTS from ElevenLabs or Fish Audio. Web Speech API as the fallback
  microphone and voice.
- **Tests:** Vitest unit tests. A local Sarvam stub (`scripts/sarvam-stub.mjs`) is used for offline integration testing.

## 4. Install

Requires Node.js 20.9 or later (tested on 22).

```bash
npm install
cp .env.example .env.local   # then add your key
```

## 5. Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SARVAM_API_KEY` | **Yes** for live analysis | Server-side only. One key covers the LLM, voice and speech-to-text. Without it, live analysis returns a clear "not configured" error. The sample demo still works. |
| `SARVAM_MODEL` | No | Default `sarvam-105b` |
| `SARVAM_REASONING_EFFORT` | No | `none` \| `low` \| `medium` \| `high` \| `max` \| `off`. Default `off` (reasoning on made JSON output less reliable in testing) |
| `SARVAM_TIMEOUT_MS` | No | Default 90000 |
| `ANALYZE_RATE_LIMIT` | No | Analyses per minute per IP, default 8 |
| `TTS_PROVIDER` | No | `sarvam` \| `elevenlabs` \| `fish` \| `none` |
| `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER`, `SARVAM_TTS_PACE` | No | Sarvam voice settings. Default `bulbul:v3`, `shubh` |
| `STT_PROVIDER`, `SARVAM_STT_MODEL` | No | `sarvam` \| `none`; default model `saaras:v4` |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` | No | ElevenLabs voice |
| `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID`, `FISH_AUDIO_MODEL` | No | Fish Audio voice |
| `SARVAM_API_BASE` | Testing only | Points at the local stub. Leave it unset in production. |

Keys are read only in server routes and are never sent to the browser. **Never commit `.env.local`.** It is covered
by `.gitignore`.

## 6. Run locally

```bash
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run build && npm start   # production build
```

To test without a real key, run `npm run stub:sarvam` in another terminal. Then start the app with
`SARVAM_API_BASE=http://localhost:4010 SARVAM_API_KEY=good-test`. The prefix before the first "-" picks a scenario:
`good`, `bad`, `quota`, `slow`, `badjson`, `badschema`, `empty`, `schema400`, `ttsfail`, `sttfail` or `clash`.

## 7. Deploy (Vercel)

1. Push the repo to GitHub without any `.env*` file except `.env.example`, then import the repo in Vercel. The
   framework preset is Next.js and needs no extra configuration.
2. In **Project → Settings → Environment Variables**, add `SARVAM_API_KEY` (plus any optional voice keys) for
   Production and Preview.
3. Deploy. Vercel serves the app over HTTPS. Security headers are set in `next.config.ts` (nosniff, frame DENY,
   referrer policy, HSTS, and a permissions policy that allows only the microphone). API responses are `no-store`.
4. API routes set `maxDuration` from 45 to 90 seconds. These limits are within Vercel's current defaults, but check
   them against your plan.
5. The microphone needs HTTPS. With Sarvam speech-to-text it works in any browser with MediaRecorder; the browser
   fallback needs Chrome or Edge. Everything else works in any modern browser.

## 8. Known limitations

- **Not tested against the real services:**
  - The Sarvam integration (LLM, TTS, STT) was checked against a local stub that mirrors Sarvam's documented API.
    Check real-model output quality with your own key before relying on it.
  - The microphone was tested with a simulated speech-recognition API, not a real microphone.
- **Rate limiting is in memory, per server instance.** On serverless it is best-effort. Use a shared store (for
  example Upstash) for real protection.
- **Session data is lost on refresh** by design: nothing is stored on a server or in the browser.
- **The scores are coaching heuristics** with starting weights. They do not predict whether a deal will close;
  calibrate the weights with sales-manager review.
- **Quotes that cannot be verified** in the transcript are left out of the scores, so a poor AI answer gives an
  incomplete score (or *Insufficient evidence*), never a lower one.
- **The microphone depends on the Web Speech API.** Firefox and some Safari versions do not support it, and the
  app falls back to typing.
- **No formal security audit or penetration test has been done.** See `TESTING.md` for exactly what was checked.
