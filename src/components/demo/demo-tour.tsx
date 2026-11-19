"use client";

import * as React from "react";
import { FlaskConical, ChevronLeft, ChevronRight, X, Presentation, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { SAMPLE_LABEL } from "@/lib/sample-deal";
import type { SectionId } from "@/lib/types";

interface TourStep {
  title: string;
  section: SectionId;
  anchor?: string;
  say: string;
}

/** Suggested judging sequence (about 4 minutes). */
export const TOUR: TourStep[] = [
  { title: "The transcript", section: "input", anchor: "transcript", say: "A ₹5 lakh CRM deal. The rep wrote: “The meeting went very well… we are close to closing.” Let's see what the transcript says." },
  { title: "Unresolved price objection", section: "intelligence", anchor: "objections", say: "The buyer called ₹5 lakh expensive against a ₹3 lakh quote. The rep answered with “a much better product” — marked Unanswered or avoided, with exact quotes and line numbers." },
  { title: "Illusion of Agreement", section: "intelligence", anchor: "illusions", say: "“Okay, sounds good. We'll think about it” sounds positive, but nothing was confirmed. DealMirror doesn't claim to read the buyer's mind — it shows what is still unconfirmed." },
  { title: "Reality Check", section: "intelligence", anchor: "reality", say: "Each claim from the rep's own impression, checked against the transcript: “liked the product” is supported, “close to closing” is contradicted." },
  { title: "Three scores", section: "health", say: "Calculated in code, not by the AI. Deal Health 32: Rohit stated a real problem and asked about setup, but made no commitment and no next step was agreed. Salesperson 41: Arjun tied features to the problem and answered questions, but skipped discovery and answered price with an unsupported “much better product”. Illusion risk 84: a polite “we'll think about it” and open objections behind an optimistic impression. Every point shows its quote. Heuristic coaching scores, not win probabilities." },
  { title: "The missing CFO", section: "stakeholders", say: "Meera, the CFO, approves anything above ₹3 lakh — but she never spoke. She's a ghost stakeholder: mentioned only." },
  { title: "Simulate recovery", section: "simulator", say: "Tick the Deal Health gaps, such as securing a commitment, agreeing a next step and engaging the CFO, and watch the hypothetical score rise. Closing every gap reaches 100. The real score never changes — this is hypothetical." },
  { title: "Practise the moment", section: "practice", say: "Start the scripted sample practice. Answer weakly (“our product is better”) and the buyer pushes back; ask a question and use the verified 30% figure and the buyer softens." },
  { title: "Mutual action plan", section: "action-plan", say: "Buyer-facing next steps. Everything here is Proposed with TBD dates, because nothing was agreed on the call. Private rules and the score are excluded in code." },
  { title: "CFO memo", section: "cfo-memo", say: "A one-page memo the buyer can forward. Capabilities, benefits and pricing come only from verified facts; ROI is marked as needing validation. Print to PDF." },
];

export function DemoBanner() {
  const { analysis, tour, setTour, setSection, section } = useDeal();
  if (analysis?.source !== "sample") return null;

  const go = (i: number) => {
    const step = TOUR[Math.max(0, Math.min(TOUR.length - 1, i))];
    setTour({ open: true, step: TOUR.indexOf(step) });
    setSection(step.section);
    if (step.anchor) {
      window.setTimeout(() => document.getElementById(step.anchor!)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  };
  const step = TOUR[tour.step] ?? TOUR[0];
  const onStepSection = step.section === section;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-amber-300 bg-amber-50 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <FlaskConical className="size-4" /> {SAMPLE_LABEL}
          <span className="hidden font-normal text-amber-800 sm:inline">· pre-computed, no AI requests</span>
        </p>
        {!tour.open ? (
          <Button size="sm" variant="outline" className="border-amber-300 bg-white" onClick={() => go(tour.step)}>
            <Presentation /> Guided demo
          </Button>
        ) : (
          <button onClick={() => setTour((t) => ({ ...t, open: false }))} className="rounded p-1 text-amber-800 hover:bg-amber-100" aria-label="Hide guided demo">
            <X className="size-4" />
          </button>
        )}
      </div>
      {tour.open && (
        <div className="border-t border-amber-200 bg-white/70 px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Demo steps">
            {TOUR.map((t, i) => (
              <button
                key={t.title}
                role="tab"
                aria-selected={i === tour.step}
                onClick={() => go(i)}
                title={t.title}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  i === tour.step ? "bg-amber-600 text-white" : i < tour.step ? "bg-amber-200 text-amber-900" : "bg-white text-amber-800 ring-1 ring-amber-200",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {tour.step + 1}. {step.title}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{step.say}</p>
              {!onStepSection && (
                <button onClick={() => go(tour.step)} className="mt-1 text-xs font-medium text-amber-800 underline-offset-2 hover:underline">
                  Go to this step
                </button>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" disabled={tour.step === 0} onClick={() => go(tour.step - 1)}>
                <ChevronLeft /> Back
              </Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={tour.step === TOUR.length - 1} onClick={() => go(tour.step + 1)}>
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      )}
      {tour.open && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-amber-300 bg-white/95 py-1 pl-3 pr-1 shadow-lg backdrop-blur print:hidden">
          <span className="mr-1 max-w-[46vw] truncate text-xs font-medium text-amber-900">
            {tour.step + 1}/{TOUR.length} · {step.title}
          </span>
          <button aria-label="Previous step" disabled={tour.step === 0} onClick={() => go(tour.step - 1)} className="flex size-8 items-center justify-center rounded-full text-amber-900 hover:bg-amber-50 disabled:opacity-30">
            <ChevronLeft className="size-4" />
          </button>
          <button aria-label="Next step" disabled={tour.step === TOUR.length - 1} onClick={() => go(tour.step + 1)} className="flex size-8 items-center justify-center rounded-full bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-30">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function TrySampleButton({ size = "sm", className }: { size?: "sm" | "lg" | "default"; className?: string }) {
  const { startSampleDemo } = useDeal();
  return (
    <Button size={size} variant="outline" className={cn("border-amber-300 text-amber-900 hover:bg-amber-50", className)} onClick={startSampleDemo}>
      <FlaskConical /> Try Sample Deal
    </Button>
  );
}

export function LiveBadgeHint() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Sparkles className="size-3.5" /> Live mode uses Sarvam AI on the server
    </span>
  );
}
