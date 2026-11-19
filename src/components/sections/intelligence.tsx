"use client";

import * as React from "react";
import {
  MessageSquareQuote,
  Lightbulb,
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  SearchX,
  Info,
  Copy,
  Check,
  ShieldAlert,
  HelpCircle,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ObjectionStatusBadge, ReviewBadge, VerdictBadge, STATUS_META } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import type { Evidence, Illusion, Objection, ObjectionCategory, RealityItem } from "@/lib/types";
import { NeedsAnalysis, NextButton, SectionHeader, useCopy } from "./shared";
import { SAMPLE_LABEL } from "@/lib/sample-deal";

const CATEGORY_LABEL: Record<ObjectionCategory, string> = {
  PRICING: "Pricing",
  PRODUCT_FUNCTIONALITY: "Product",
  COMPETITION: "Competition",
  IMPLEMENTATION: "Implementation",
  SECURITY: "Security",
  COMPLIANCE: "Compliance",
  ROI: "ROI",
  BUDGET: "Budget",
  TIMELINE: "Timeline",
  STAKEHOLDER_APPROVAL: "Stakeholder approval",
  OTHER: "Other",
};

const SEVERITY: Record<Objection["status"], number> = {
  UNANSWERED_OR_AVOIDED: 0,
  POSSIBLY_UNRESOLVED: 1,
  UNKNOWN: 2,
  RESOLVED_WITH_EVIDENCE: 3,
};

/* ---------------- Evidence ---------------- */

function EvidenceLine({ label, e, tone }: { label: string; e: Evidence | null; tone: "buyer" | "seller" | "reply" }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-3">
      <span
        className={cn(
          "pt-0.5 text-[11px] font-semibold uppercase tracking-wide",
          tone === "seller" ? "text-teal-700" : "text-slate-400",
        )}
      >
        {label}
      </span>
      {e ? (
        <div className="min-w-0">
          <p
            dir="auto"
            className={cn(
              "text-sm leading-relaxed break-words",
              tone === "reply" ? "italic text-slate-500" : "text-slate-800",
              !e.verified && "decoration-amber-400 decoration-wavy underline-offset-4 [text-decoration-line:underline]",
            )}
          >
            “{e.quote}”
          </p>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400">
            {e.verified ? (
              <>
                <CheckCircle2 className="size-3 text-emerald-500" /> Found in transcript · line {e.line}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <SearchX className="size-3" /> Not found in transcript. Needs review.
              </span>
            )}
          </span>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No direct quote</p>
      )}
    </div>
  );
}

/* ---------------- Objections ---------------- */

function ObjectionCard({ o }: { o: Objection }) {
  const accent = {
    UNANSWERED_OR_AVOIDED: "before:bg-red-500",
    POSSIBLY_UNRESOLVED: "before:bg-amber-500",
    UNKNOWN: "before:bg-slate-300",
    RESOLVED_WITH_EVIDENCE: "before:bg-emerald-500",
  }[o.status];
  return (
    <Card className={cn("relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1", accent)}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pl-6">
        <div className="flex min-w-0 items-center gap-2">
          <Badge>{CATEGORY_LABEL[o.category]}</Badge>
          <CardTitle dir="auto">{o.title}</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {o.needsReview && <ReviewBadge />}
          {o.isInferred && <Badge variant="neutral">Inferred · {o.confidence} confidence</Badge>}
          <ObjectionStatusBadge status={o.status} />
        </div>
      </CardHeader>
      <CardContent className="pl-6">
        <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3.5">
          <EvidenceLine label="Buyer concern" e={o.buyerConcern} tone="buyer" />
          <EvidenceLine label="Seller response" e={o.sellerResponse} tone="seller" />
          <EvidenceLine label="Buyer follow-up" e={o.buyerFollowUp} tone="reply" />
        </div>
        <p dir="auto" className="mt-3 text-sm leading-relaxed text-slate-600">
          <span className="font-medium text-slate-800">Why this status: </span>
          {o.explanation}
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------- Illusion of Agreement ---------------- */

function FlowStep({ label, e, highlight }: { label: string; e: Evidence | null; highlight?: string }) {
  const isPolite = highlight && e && e.quote === highlight;
  return (
    <div
      className={cn(
        "flex-1 rounded-lg border bg-white p-3",
        isPolite ? "border-amber-300 bg-amber-50/60" : "border-slate-200",
      )}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {e ? (
        <p dir="auto" className="text-sm leading-relaxed text-slate-800">
          “{e.quote}”
          {!e.verified && <SearchX className="ml-1 inline size-3.5 text-amber-600" aria-label="Not found in transcript" />}
        </p>
      ) : (
        <p className="text-sm text-slate-400">No direct quote</p>
      )}
    </div>
  );
}

function IllusionCard({ il }: { il: Illusion }) {
  const rows: [string, string, React.ComponentType<{ className?: string }>, string][] = [
    ["What the salesperson addressed", il.addressed, CheckCircle2, "text-emerald-600"],
    ["What remains unconfirmed", il.unconfirmed, HelpCircle, "text-amber-600"],
    ["Why this could create false confidence", il.falseConfidence, ShieldAlert, "text-red-500"],
    ["Clarification to seek", il.clarificationToSeek, Lightbulb, "text-teal-700"],
  ];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Polite phrase</p>
          <CardTitle dir="auto" className="mt-0.5 text-base">“{il.politePhrase.quote}”</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          {il.needsReview && <ReviewBadge />}
          <Badge variant="neutral">Uncertainty: {il.uncertainty}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          <FlowStep label="Buyer concern" e={il.buyerConcern} />
          <ArrowRight className="hidden size-4 shrink-0 text-slate-300 md:block" />
          <ArrowDown className="mx-auto size-4 text-slate-300 md:hidden" />
          <FlowStep label="Seller response" e={il.sellerResponse} />
          <ArrowRight className="hidden size-4 shrink-0 text-slate-300 md:block" />
          <ArrowDown className="mx-auto size-4 text-slate-300 md:hidden" />
          <FlowStep label="Buyer follow-up" e={il.buyerFollowUp} highlight={il.politePhrase.quote} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map(([label, text, Icon, color]) => (
            <div key={label} className="flex gap-2.5">
              <Icon className={cn("mt-0.5 size-4 shrink-0", color)} />
              <div>
                <dt className="text-xs font-semibold text-slate-800">{label}</dt>
                <dd dir="auto" className="mt-0.5 text-sm leading-relaxed text-slate-600">{text || "—"}</dd>
              </div>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          Polite phrases alone do not prove disagreement. DealMirror cannot know what the buyer privately thinks.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------- Reality Check ---------------- */

function RealityTable({ items, hasImpression }: { items: RealityItem[]; hasImpression: boolean }) {
  if (!hasImpression || items.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        {hasImpression
          ? "No checkable claims were found in your meeting impression."
          : "Add “How do you think the meeting went?” on the Deal Input screen to run Reality Check."}
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="px-0 py-0">
        <div className="hidden grid-cols-[1fr_160px_1.3fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <span>Your claim</span>
          <span>Verdict</span>
          <span>Transcript evidence</span>
        </div>
        {items.map((r, i) => (
          <div key={i} className="grid gap-2 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1fr_160px_1.3fr] md:gap-4">
            <span dir="auto" className="text-sm font-medium text-slate-800">“{r.claim}”</span>
            <span className="flex flex-wrap items-start gap-1">
              <VerdictBadge verdict={r.verdict} />
              {r.needsReview && <ReviewBadge />}
            </span>
            <div className="min-w-0">
              {r.evidence ? (
                <p dir="auto" className="text-sm italic text-slate-600">
                  “{r.evidence.quote}”
                  {r.evidence.verified && <span className="ml-1.5 not-italic text-[11px] text-slate-400">line {r.evidence.line}</span>}
                </p>
              ) : (
                <p className="text-sm text-slate-400">No relevant line in the transcript</p>
              )}
              <p dir="auto" className="mt-1 text-xs leading-relaxed text-slate-500">{r.explanation}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------------- Suggested responses ---------------- */

function SuggestionCard({ o }: { o: Objection }) {
  const { copied, copy } = useCopy();
  const s = o.suggestion;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{CATEGORY_LABEL[o.category]}</Badge>
          <CardTitle dir="auto">{o.title}</CardTitle>
        </div>
        <ObjectionStatusBadge status={o.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        {!s ? (
          <p className="text-sm text-slate-500">No suggestion was returned for this objection.</p>
        ) : (
          <>
            {s.withheld ? (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>The AI suggestion was withheld because it broke one of your rules.</span>
              </div>
            ) : (
              s.text && (
                <div className="rounded-lg bg-teal-50/70 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p dir="auto" className="text-sm leading-relaxed text-teal-950">{s.text}</p>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => copy(o.id, s.text)} aria-label="Copy suggestion">
                      {copied === o.id ? <Check /> : <Copy />}
                    </Button>
                  </div>
                </div>
              )
            )}
            {s.clarifyingQuestion && (
              <p dir="auto" className="flex gap-2 text-sm text-slate-700">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span><span className="font-medium">Ask first: </span>{s.clarifyingQuestion}</span>
              </p>
            )}
            {s.basedOn.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Based on:</span>
                {s.basedOn.map((b) => (
                  <Badge key={b} variant="neutral" className="max-w-full truncate font-normal">{b}</Badge>
                ))}
              </div>
            )}
            {s.warnings.map((w) => (
              <p key={w} className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                <ShieldAlert className="mt-px size-3.5 shrink-0" /> {w}
              </p>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Section ---------------- */

function SubHeading({ id, title, desc, count }: { id: string; title: string; desc: string; count: number }) {
  return (
    <div id={id} className="mb-3 mt-8 scroll-mt-24 first:mt-0">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        {title} <Badge variant="neutral">{count}</Badge>
      </h2>
      <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

export function IntelligenceSection() {
  const { analysis, input } = useDeal();
  if (!analysis) {
    return (
      <div>
        <SectionHeader id="intelligence" mock={false} />
        <NeedsAnalysis />
      </div>
    );
  }

  const objections = [...analysis.objections].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
  const unresolved = objections.filter((o) => o.status !== "RESOLVED_WITH_EVIDENCE");
  const counts = Object.fromEntries(
    (Object.keys(STATUS_META) as Objection["status"][]).map((s) => [s, objections.filter((o) => o.status === s).length]),
  );
  const isSample = analysis.source === "sample";

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div>
      <SectionHeader
        id="intelligence"
        mock={false}
        actions={
          isSample ? (
            <Badge variant="amber"><FlaskConical /> {SAMPLE_LABEL} · pre-computed</Badge>
          ) : (
            <Badge variant="teal"><Sparkles /> Analysed by {analysis.model}</Badge>
          )
        }
      />

      {analysis.notices.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
          {analysis.notices.map((n) => (
            <p key={n} className="flex gap-2 text-xs text-slate-600">
              <Info className="mt-px size-3.5 shrink-0 text-slate-400" /> {n}
            </p>
          ))}
        </div>
      )}

      <Card className="mb-4">
        <CardHeader className="flex-row items-center gap-2">
          <MessageSquareQuote className="size-4 text-teal-700" />
          <CardTitle>Call summary · {analysis.dealName}</CardTitle>
        </CardHeader>
        <CardContent>
          <p dir="auto" className="text-sm leading-relaxed text-slate-600">{analysis.callSummary || "—"}</p>
        </CardContent>
      </Card>

      <div className="sticky top-14 z-10 -mx-1 mb-2 flex flex-wrap gap-1.5 bg-slate-50/90 px-1 py-2 backdrop-blur print:hidden">
        {[
          ["objections", "Objections", objections.length],
          ["illusions", "Illusion of Agreement", analysis.illusions.length],
          ["reality", "Reality Check", analysis.realityCheck.length],
          ["responses", "Suggested responses", unresolved.length],
        ].map(([id, label, n]) => (
          <button
            key={id as string}
            onClick={() => jump(id as string)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-teal-600 hover:text-teal-800"
          >
            {label} · {n}
          </button>
        ))}
      </div>

      <SubHeading id="objections" title="Objection Intelligence" desc="Each concern, how it was answered, and what the buyer said next." count={objections.length} />
      {objections.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No significant buyer objections were found in this transcript. That can mean a smooth call, or a call where the buyer did not voice concerns. Check Reality Check and next steps.
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_META) as Objection["status"][])
              .filter((s) => counts[s])
              .map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <ObjectionStatusBadge status={s} /> × {counts[s]}
                </span>
              ))}
          </div>
          <div className="space-y-3">
            {objections.map((o) => (
              <ObjectionCard key={o.id} o={o} />
            ))}
          </div>
        </>
      )}

      <SubHeading id="illusions" title="Illusion of Agreement" desc="Polite buyer language that could be mistaken for a yes." count={analysis.illusions.length} />
      {analysis.illusions.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">No polite-agreement moments were detected.</Card>
      ) : (
        <div className="space-y-3">
          {analysis.illusions.map((il) => (
            <IllusionCard key={il.id} il={il} />
          ))}
        </div>
      )}

      <SubHeading id="reality" title="Reality Check" desc="Only the claims you wrote, compared with what the transcript shows." count={analysis.realityCheck.length} />
      <RealityTable items={analysis.realityCheck} hasImpression={!!input.impression.text.trim() || isSample} />

      <SubHeading id="responses" title="Suggested responses" desc="For every unresolved objection. Built only from your facts, offers and rules, then checked in code." count={unresolved.length} />
      {unresolved.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">Every objection was resolved with evidence. Nothing to suggest.</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {unresolved.map((o) => (
            <SuggestionCard key={o.id} o={o} />
          ))}
        </div>
      )}

      <NextButton to="health" />
    </div>
  );
}

