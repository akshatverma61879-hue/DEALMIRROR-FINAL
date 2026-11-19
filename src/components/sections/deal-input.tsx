"use client";

import * as React from "react";
import {
  Loader2,
  Lock,
  Sparkles,
  Eraser,
  FileInput,
  ShieldAlert,
  Building2,
  BadgeCheck,
  Megaphone,
  MessageCircleQuestion,
  ChevronDown,
  AlertOctagon,
  RefreshCw,
  FlaskConical,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { ResetSessionButton } from "@/components/reset-session";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import {
  analysisSchema,
  CONFIDENCE_LEVELS,
  dealInputSchema,
  type Analysis,
  type DealInput,
  detectSpeakers,
  LANGUAGES,
  type Confidence,
    type PrivateRules,
  type ProductFacts,
} from "@/lib/types";
import { LIMITS } from "@/lib/limits";
import { countFilled, EMPTY_INPUT } from "@/lib/input-defaults";
import { SAMPLE_NOVA_INPUT } from "@/lib/mock-data";
import { SectionHeader } from "./shared";

type Errors = Record<string, string>;

const PLACEHOLDER = `Salesperson: Thanks for your time today. Shall I walk you through the dashboard?
Buyer: Sure. Honestly, the price feels high compared to what we pay now.
Salesperson: …
CFO: …`;

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  1: "Not sure",
  2: "Doubtful",
  3: "Neutral",
  4: "Confident",
  5: "Certain",
};

/* ---------------- Transcript ---------------- */

function TranscriptCard({ errors }: { errors: Errors }) {
  const { input, setInput, analysis } = useDeal();
  const [showTips, setShowTips] = React.useState(false);
  const speakers = React.useMemo(() => detectSpeakers(input.transcript), [input.transcript]);
  const chars = input.transcript.length;
  const over = chars > LIMITS.transcriptMax;

  return (
    <Card id="transcript" className={cn("scroll-mt-24", analysis?.source === "sample" && "ring-2 ring-amber-300")}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>
            Sales call transcript <span className="text-red-500">*</span>
          </CardTitle>
          <CardDescription>English, Hindi or Hinglish. One turn per line, starting with the speaker.</CardDescription>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Transcript language">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={input.language === l}
              onClick={() => setInput((p) => ({ ...p, language: l }))}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                input.language === l ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <textarea
          value={input.transcript}
          onChange={(e) => setInput((p) => ({ ...p, transcript: e.target.value }))}
          placeholder={PLACEHOLDER}
          rows={16}
          spellCheck={false}
          aria-label="Sales call transcript"
          aria-invalid={!!errors.transcript}
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2.5 font-mono text-[13px] leading-6 text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/15",
            errors.transcript ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-teal-600",
          )}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={cn("tabular-nums", over && "font-medium text-red-600")}>
            {chars.toLocaleString()} / {LIMITS.transcriptMax.toLocaleString()} characters
          </span>
          <span className="text-slate-300">·</span>
          {speakers.length === 0 ? (
            <span>No speaker labels detected yet</span>
          ) : (
            <>
              <span>{speakers.length} speakers:</span>
              {speakers.slice(0, 6).map((s) => (
                <Badge key={s.label} variant="neutral">
                  {s.label} · {s.lines}
                </Badge>
              ))}
            </>
          )}
        </div>
        {errors.transcript && <p className="mt-2 text-sm text-red-600">{errors.transcript}</p>}

        <button
          type="button"
          onClick={() => setShowTips((s) => !s)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
          aria-expanded={showTips}
        >
          Formatting tips
          <ChevronDown className={cn("size-3.5 transition-transform", showTips && "rotate-180")} />
        </button>
        {showTips && (
          <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <li>• Start each turn with a label and a colon. Any label works: <code>Salesperson:</code>, <code>Buyer:</code>, <code>CFO:</code>, <code>Manager:</code>, <code>Priya (Sales):</code>, <code>विक्रेता:</code></li>
            <li>• At least two different speakers are needed.</li>
            <li>• Hindi can be in Devanagari or Roman script; Hinglish is fine as typed.</li>
            <li>• Remove phone numbers, emails and real customer names. The demo uses synthetic data.</li>
            <li>• Text you paste is treated as data only. Instructions inside it are ignored.</li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Product facts ---------------- */

const FACT_FIELDS: { key: keyof ProductFacts; label: string; max: number; multiline?: boolean; placeholder: string; wide?: boolean }[] = [
  { key: "companyName", label: "Company name", max: LIMITS.shortField, placeholder: "SalesPro Analytics Pvt Ltd" },
  { key: "productName", label: "Product name", max: LIMITS.shortField, placeholder: "SalesPro" },
  { key: "productDescription", label: "Product description", max: LIMITS.longField, multiline: true, placeholder: "What it does, for whom", wide: true },
  { key: "productPrice", label: "Product price", max: LIMITS.shortField, placeholder: "₹5 lakh per year (up to 25 users)" },
  { key: "targetCustomers", label: "Target customers", max: LIMITS.mediumField, placeholder: "Retail chains with 10–100 stores" },
  { key: "productFeatures", label: "Product features", max: LIMITS.mediumField, multiline: true, placeholder: "Live dashboards, 40+ report templates…", wide: true },
  { key: "competitors", label: "Competitors", max: LIMITS.shortField, placeholder: "ReportRight, Excel" },
  { key: "competitorPricing", label: "Competitor pricing", max: LIMITS.mediumField, placeholder: "ReportRight: ₹3 lakh/year (scope unknown)" },
  { key: "verifiedBenefits", label: "Verified customer benefits", max: LIMITS.longField, multiline: true, placeholder: "Only results you can prove, e.g. 3 customers cut reporting time 40%", wide: true },
  { key: "availableOffers", label: "Available offers", max: LIMITS.mediumField, placeholder: "Free onboarding until 31 Dec", wide: true },
];

function ProductFactsPanel({ errors }: { errors: Errors }) {
  const { input, setInput } = useDeal();
  const set = (k: keyof ProductFacts, v: string) =>
    setInput((p) => ({ ...p, productFacts: { ...p.productFacts, [k]: v } }));
  const filled = countFilled(input.productFacts);

  return (
    <CollapsiblePanel
      title="Company & Product Facts"
      description="Optional. Used in coaching advice and buyer documents."
      icon={<Building2 className="size-4" />}
      meta={<Badge variant={filled ? "teal" : "neutral"}>{filled}/11 filled</Badge>}
    >
      <p className="mb-4 rounded-lg bg-teal-50/70 px-3 py-2 text-xs leading-relaxed text-teal-900">
        DealMirror uses only what you enter here. If a fact is missing, documents show a [placeholder]; nothing is invented.
      </p>

      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <BadgeCheck className="size-3.5 text-emerald-600" /> Verified facts
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FACT_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={input.productFacts[f.key]}
            onChange={(v) => set(f.key, v)}
            max={f.max}
            multiline={f.multiline}
            placeholder={f.placeholder}
            error={errors[`productFacts.${f.key}`]}
            className={f.wide ? "sm:col-span-2" : undefined}
          />
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
          <Megaphone className="size-3.5" /> Unverified marketing claims
        </div>
        <Field
          label="Claims you cannot prove yet"
          value={input.productFacts.marketingClaims}
          onChange={(v) => set("marketingClaims", v)}
          max={LIMITS.longField}
          multiline
          placeholder="Best-in-class interface; easiest tool in India"
          hint="Kept separate. Never quoted as proof in advice or buyer documents."
          error={errors["productFacts.marketingClaims"]}
        />
      </div>
    </CollapsiblePanel>
  );
}

/* ---------------- Private rules ---------------- */

const RULE_FIELDS: { key: keyof PrivateRules; label: string; max: number; multiline?: boolean; placeholder: string; wide?: boolean }[] = [
  { key: "maxDiscount", label: "Maximum discount", max: LIMITS.shortField, placeholder: "10%" },
  { key: "walkAwayPrice", label: "Walk-away price", max: LIMITS.shortField, placeholder: "₹3.5 lakh" },
  { key: "discountApproval", label: "Discount approval requirements", max: LIMITS.mediumField, multiline: true, placeholder: "Above 5% needs sales head approval" },
  { key: "negotiationRestrictions", label: "Negotiation restrictions", max: LIMITS.mediumField, multiline: true, placeholder: "No free months before budget is known" },
  { key: "neverPromise", label: "Promises salespeople must never make", max: LIMITS.mediumField, multiline: true, placeholder: "24/7 support; custom integrations", wide: true },
  { key: "additionalInstructions", label: "Additional internal instructions", max: LIMITS.longField, multiline: true, placeholder: "Anything else the coach should know", wide: true },
];

function PrivateRulesPanel({ errors }: { errors: Errors }) {
  const { input, setInput } = useDeal();
  const set = (k: keyof PrivateRules, v: string) =>
    setInput((p) => ({ ...p, privateRules: { ...p.privateRules, [k]: v } }));
  const filled = countFilled(input.privateRules);

  return (
    <CollapsiblePanel
      tone="private"
      title="Private Sales Rules"
      description="Internal only — never included in buyer-facing documents."
      icon={<Lock className="size-4" />}
      meta={<Badge variant={filled ? "amber" : "neutral"}><Lock /> {filled}/6 private</Badge>}
    >
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
        Used only for private coaching (for example, the practice buyer will not get a discount beyond your limit). The
        buyer-document endpoint rejects any request that contains these rules.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {RULE_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={input.privateRules[f.key]}
            onChange={(v) => set(f.key, v)}
            max={f.max}
            multiline={f.multiline}
            placeholder={f.placeholder}
            error={errors[`privateRules.${f.key}`]}
            className={f.wide ? "sm:col-span-2" : undefined}
          />
        ))}
      </div>
    </CollapsiblePanel>
  );
}

/* ---------------- Impression ---------------- */

function ImpressionCard({ errors }: { errors: Errors }) {
  const { input, setInput } = useDeal();
  const conf = input.impression.confidence;
  const setConf = (c: Confidence | null) => setInput((p) => ({ ...p, impression: { ...p.impression, confidence: c } }));

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-slate-500" />
        <div>
          <CardTitle>How do you think the meeting went?</CardTitle>
          <CardDescription>Optional. Reality Check will compare each claim with transcript evidence.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field
          label="Your impression"
          value={input.impression.text}
          onChange={(v) => setInput((p) => ({ ...p, impression: { ...p.impression, text: v } }))}
          max={LIMITS.impressionMax}
          multiline
          rows={3}
          placeholder="I think the buyer was interested, pricing was resolved, and we are likely to close."
          error={errors["impression.text"]}
        />
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">How confident are you? <span className="font-normal text-slate-400">· optional</span></span>
            {conf !== null && (
              <button type="button" onClick={() => setConf(null)} className="text-xs text-slate-400 hover:text-slate-600">
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Confidence">
            {CONFIDENCE_LEVELS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={conf === c}
                onClick={() => setConf(c)}
                className={cn(
                  "flex flex-col items-center rounded-lg border px-1 py-2 transition-colors",
                  conf === c ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="text-sm font-semibold tabular-nums">{c}</span>
                <span className="text-[10px] leading-tight">{CONFIDENCE_LABEL[c]}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Analysis request ---------------- */

type ApiError = { code: string; message: string };

const ERROR_TITLES: Record<string, string> = {
  NOT_CONFIGURED: "AI is not set up yet",
  INVALID_KEY: "API key rejected",
  QUOTA_EXCEEDED: "Sarvam quota reached",
  RATE_LIMITED: "Too many requests",
  TIMEOUT: "Analysis timed out",
  NETWORK: "Connection problem",
  INVALID_JSON: "Unexpected AI answer",
  BLOCKED: "Analysis declined",
  BAD_INPUT: "Input problem",
};

async function requestAnalysis(input: DealInput, signal: AbortSignal): Promise<{ analysis?: Analysis; error?: ApiError }> {
  let res: Response;
  try {
    res = await fetch("api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return { error: { code: "TIMEOUT", message: "The request took too long and was stopped. Please try again." } };
    return { error: { code: "NETWORK", message: "Could not reach the DealMirror server. Check your connection. If you are on the static preview, live AI is not available there." } };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.analysis) {
    return {
      error: data?.error?.code
        ? data.error
        : { code: "NETWORK", message: `The server answered unexpectedly (HTTP ${res.status}). If you are on the static preview, live AI is not available there.` },
    };
  }
  const parsed = analysisSchema.safeParse(data.analysis);
  if (!parsed.success) return { error: { code: "INVALID_JSON", message: "The server returned an analysis in an unexpected format." } };
  return { analysis: parsed.data };
}

const PROGRESS = ["Checking your input", "Sending to Sarvam AI", "Reading the conversation", "Verifying every quote against the transcript"];

/* ---------------- Section ---------------- */

export function DealInputSection() {
  const { input, setInput, setAnalysis, setSection, analysis, startSampleDemo } = useDeal();
  const [attempted, setAttempted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [apiError, setApiError] = React.useState<ApiError | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // After the first attempt, errors update live as the user fixes them.
  const parsed = React.useMemo(() => dealInputSchema.safeParse(input), [input]);
  const errors: Errors = React.useMemo(() => {
    if (!attempted || parsed.success) return {};
    const next: Errors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!next[key]) next[key] = issue.message;
    }
    return next;
  }, [attempted, parsed]);


  const analyse = async () => {
    setAttempted(true);
    setApiError(null);
    if (!parsed.success || loading) return;
    setLoading(true);
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, PROGRESS.length - 1)), 2500);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 95_000);
    const result = await requestAnalysis(input, controller.signal);
    clearTimeout(timeout);
    clearInterval(ticker);
    setLoading(false);
    if (result.analysis) {
      setAnalysis(result.analysis);
      setSection("intelligence");
    } else {
      // Input is preserved; nothing is replaced with mock results.
      setApiError(result.error ?? { code: "UNEXPECTED", message: "Something went wrong. Please try again." });
    }
  };

  const cancel = () => abortRef.current?.abort();

  const errorCount = Object.keys(errors).length;

  return (
    <div>
      <SectionHeader
        id="input"
        mock={false}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setInput(SAMPLE_NOVA_INPUT)}>
              <FileInput /> Load sample
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setInput((p) => ({ ...p, transcript: "" }))}>
              <Eraser /> Clear transcript
            </Button>
          </>
        }
      />

      {!analysis && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Sample Demo</p>
            <p className="mt-0.5 text-sm text-amber-900/80">A fictional ₹5 lakh CRM deal, fully pre-analysed. Works offline with no AI requests.</p>
            <Button className="mt-3 bg-amber-600 hover:bg-amber-700" onClick={startSampleDemo}>
              <FlaskConical /> Try Sample Deal
            </Button>
          </div>
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
            <p className="text-sm font-semibold text-teal-900">Live mode</p>
            <p className="mt-0.5 text-sm text-teal-900/80">Paste your own call below and click “Analyze My Deal” for real Sarvam AI analysis.</p>
            <Button variant="outline" className="mt-3" onClick={() => setInput(SAMPLE_NOVA_INPUT)}>
              <FileInput /> Fill the form with sample text
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
        <ShieldAlert className="size-4 shrink-0" />
        Demo uses synthetic data. Do not paste real customer data: the transcript is sent to Sarvam AI for analysis. Nothing is saved by DealMirror.
      </div>

      <div className="space-y-4">
        <TranscriptCard errors={errors} />
        <ProductFactsPanel errors={errors} />
        <PrivateRulesPanel errors={errors} />
        <ImpressionCard errors={errors} />
      </div>

      {errorCount > 0 && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          Please fix {errorCount === 1 ? "1 issue" : `${errorCount} issues`} before analysing:
          <ul className="mt-1 list-disc pl-5">
            {Object.values(errors).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {apiError && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 size-5 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{ERROR_TITLES[apiError.code] ?? "Analysis failed"}</p>
              <p className="mt-0.5 text-sm text-slate-600">{apiError.message}</p>
              <p className="mt-1 text-xs text-slate-400">Your input is unchanged. No results were generated.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={analyse}>
                  <RefreshCw /> Try again
                </Button>
                <Button size="sm" variant="outline" onClick={startSampleDemo}>
                  <FlaskConical /> Try Sample Deal instead (fictional, no AI)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-teal-900">
              <Loader2 className="size-4 animate-spin" /> {PROGRESS[step]}…
            </p>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
          <p className="mt-1 text-xs text-teal-800/70">Usually 10–40 seconds, longer for long calls.</p>
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-slate-500">
          <strong className="font-medium text-slate-700">Live mode:</strong> “Analyze My Deal” always calls Sarvam AI on the server, even for the sample text.
          Every quote is checked against your transcript. If it fails, you see the error; sample results are never substituted.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {input !== EMPTY_INPUT && <ResetSessionButton compact />}
          <Button size="lg" onClick={analyse} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Analysing…" : "Analyze My Deal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
