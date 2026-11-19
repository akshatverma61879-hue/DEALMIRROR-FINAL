"use client";

import { Info, ArrowRight, Clock, Layers, ShieldAlert, HelpCircle, MinusCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { ScoreGauge, toneColor } from "@/components/charts/score-gauge";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { BANDS, MIN_COVERAGE, SCORE_DISCLAIMER, SCORE_META } from "@/lib/scoring-rubric";
import { gaps } from "@/lib/scoring";
import type { CriterionResult, ScoreCard, ScoreSet } from "@/lib/types";
import { NeedsAnalysis, NextButton, SectionHeader } from "./shared";

const STAGE_LABEL: Record<ScoreSet["stage"], string> = {
  DISCOVERY: "Discovery",
  EVALUATION: "Evaluation",
  NEGOTIATION: "Negotiation",
  UNKNOWN: "Not clear",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function StageStrip({ scores }: { scores: ScoreSet }) {
  const { analysis } = useDeal();
  const ev = analysis?.salesStage.evidence;
  return (
    <Card className="mb-4 flex flex-wrap items-start gap-3 p-4">
      <Layers className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">Sales stage: {STAGE_LABEL[scores.stage]}</span>
          {scores.stage === "UNKNOWN" && <span className="text-slate-500"> · balanced ({STAGE_LABEL[scores.weightsFrom]}) weights used</span>}
        </p>
        {ev?.verified ? (
          <p dir="auto" className="mt-0.5 text-xs italic text-slate-500">“{ev.quote}” {ev.line && <span className="not-italic text-slate-400">line {ev.line}</span>}</p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500">The transcript did not show the stage with a verifiable quote.</p>
        )}
      </div>
      <p className="w-full text-[11px] leading-relaxed text-slate-500 sm:w-auto sm:max-w-sm">
        Weights change by stage: discovery rewards understanding the need; negotiation rewards commitments, objection handling and access to the approver.
      </p>
    </Card>
  );
}

function ScoreSummary({ card }: { card: ScoreCard }) {
  const meta = SCORE_META[card.id];
  const band = BANDS[card.id].find((b) => b.label === card.band);
  return (
    <Card className="flex flex-col items-center p-5">
      <p className="text-sm font-semibold text-slate-900">{card.title}</p>
      <p className="mb-3 text-center text-xs text-slate-500">{meta.question}</p>
      {card.score === null ? (
        <div className="flex size-[150px] flex-col items-center justify-center rounded-full border-8 border-slate-100 text-center">
          <HelpCircle className="size-6 text-slate-400" />
          <span className="mt-1 px-4 text-xs font-medium text-slate-500">Insufficient evidence</span>
        </div>
      ) : (
        <ScoreGauge score={card.score} label={card.higherIsBetter ? "out of 100" : "risk, out of 100"} size={150} variant="full" tone={card.bandTone} name={card.title} />
      )}
      <Badge variant={card.bandTone === "neutral" ? "neutral" : card.bandTone} className="mt-3">{card.band}</Badge>
      <p className="mt-2 text-center text-xs text-slate-500">
        {band?.description ?? `Less than ${Math.round(MIN_COVERAGE * 100)}% of the weighted criteria could be judged from verified quotes, so no number is shown.`}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">{Math.round(card.coverage * 100)}% of applicable weight judged from evidence</p>
      {card.cap && (
        <p role="note" className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs leading-relaxed text-red-800">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          <span>
            Capped at {card.cap.max}: {card.cap.label.toLowerCase()}. “{card.cap.quote}”
            {card.uncapped !== null && card.uncapped > card.cap.max && ` (criteria alone: ${card.uncapped})`}
          </span>
        </p>
      )}
    </Card>
  );
}

function ResultCell({ c, higherIsBetter }: { c: CriterionResult; higherIsBetter: boolean }) {
  if (c.outcome === "insufficient")
    return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><HelpCircle className="size-3.5" /> Insufficient evidence</span>;
  if (c.outcome === "not_applicable")
    return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><MinusCircle className="size-3.5" /> Not applicable</span>;
  const v = c.value ?? 0;
  const good = higherIsBetter ? v : 1 - v;
  const tone = good >= 0.75 ? "text-emerald-700" : good >= 0.4 ? "text-amber-700" : "text-red-600";
  return (
    <span className={cn("font-semibold tabular-nums", tone)}>
      {fmt(c.earned)} <span className="font-normal text-slate-400">/ {fmt(c.possible)}</span>
    </span>
  );
}

function Breakdown({ card }: { card: ScoreCard }) {
  const scored = card.criteria.filter((c) => c.outcome === "scored");
  const total = scored.reduce((s, c) => s + c.earned, 0);
  return (
    <CollapsiblePanel
      title={`${card.title}: how it was calculated`}
      description={card.higherIsBetter ? "Points earned from verified evidence. Unjudged criteria are left out, not penalised." : "Risk points from verified evidence (higher = more risk). Unjudged criteria are left out."}
      meta={<span className={cn("text-sm font-semibold tabular-nums", toneColor(card.bandTone).text)}>{card.score ?? "—"}</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Criterion</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Evidence</th>
              <th className="px-4 py-2 text-right">{card.higherIsBetter ? "Points" : "Risk"}</th>
            </tr>
          </thead>
          <tbody>
            {card.criteria.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{c.label}</div>
                  <div className="mt-0.5 max-w-xs text-xs text-slate-500">{c.note}</div>
                </td>
                <td className="px-3 py-3 tabular-nums text-slate-600">{c.weight || "—"}</td>
                <td className="px-3 py-3">
                  {c.evidence.length ? (
                    <ul className="space-y-1">
                      {c.evidence.slice(0, 3).map((e, i) => (
                        <li key={i} dir="auto" className="text-xs italic text-slate-700">
                          “{e.quote}” {e.line && <span className="not-italic text-[11px] text-slate-400">line {e.line}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : c.basedOnAbsence ? (
                    <span className="text-xs text-slate-500">Not found anywhere in the call</span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right"><ResultCell c={c} higherIsBetter={card.higherIsBetter} /></td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-4 py-3 text-xs text-slate-600" colSpan={3}>
                {card.score === null
                  ? `Only ${Math.round(card.coverage * 100)}% of the applicable weight could be judged (minimum ${Math.round(MIN_COVERAGE * 100)}%).`
                  : `100 × Σ(weight × value) ÷ Σ(judged weight) = ${fmt(total)}${card.cap && card.uncapped !== null && card.uncapped > card.cap.max ? ` → capped at ${card.cap.max}` : ""}`}
              </td>
              <td className="px-4 py-3 text-right text-lg font-semibold tabular-nums text-slate-900">{card.score ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}

export function DealHealthSection() {
  const { analysis, scores, setSection } = useDeal();
  if (!analysis || !scores) {
    return (
      <div>
        <SectionHeader id="health" />
        <NeedsAnalysis />
      </div>
    );
  }

  const cards = [scores.deal, scores.seller, scores.illusion];
  const actions = [
    ...(scores.deal.cap ? [{ id: scores.deal.cap.ruleId, text: scores.deal.cap.recommendation, label: scores.deal.cap.label, from: "Deal Health" }] : []),
    ...[...gaps(scores.deal).map((c) => ({ c, from: "Deal Health" })), ...gaps(scores.seller).map((c) => ({ c, from: "Salesperson" }))]
      .sort((a, b) => b.c.possible - b.c.earned - (a.c.possible - a.c.earned))
      .map(({ c, from }) => ({ id: c.id, text: c.recommendation, label: c.label, from })),
  ].slice(0, 6);
  const unjudged = cards.flatMap((card) => card.criteria.filter((c) => c.outcome === "insufficient").map((c) => ({ card: card.title, c })));

  return (
    <div>
      <SectionHeader id="health" />
      <StageStrip scores={scores} />

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <ScoreSummary key={c.id} card={c} />
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-px size-3.5 shrink-0" /> {SCORE_DISCLAIMER} Each score is independent: a well-run call can still be a weak deal, and a friendly call can hide high illusion risk.
      </p>

      <div className="mt-6 space-y-3">
        {cards.map((c) => (
          <Breakdown key={c.id} card={c} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recommended next actions</CardTitle>
            <CardDescription>Largest gaps first. None of these has happened yet.</CardDescription>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <p className="text-sm text-slate-500">No gaps found in the judged criteria. Keep confirming next steps.</p>
            ) : (
              <ol className="space-y-2.5">
                {actions.map((a, i) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800">{i + 1}</span>
                    <div>
                      <p className="text-sm text-slate-800">{a.text}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><Clock className="size-3" /> To do · {a.from}: {a.label}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {actions.length > 0 && (
              <button onClick={() => setSection("simulator")} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800">
                See the effect in the Risk Simulator <ArrowRight className="size-4" />
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HelpCircle className="size-4 text-slate-400" /> Insufficient evidence</CardTitle>
            <CardDescription>Criteria that could not be judged. They were left out of the scores, not penalised.</CardDescription>
          </CardHeader>
          <CardContent>
            {unjudged.length === 0 ? (
              <p className="text-sm text-slate-500">Every applicable criterion had evidence.</p>
            ) : (
              <ul className="space-y-2">
                {unjudged.map(({ card, c }) => (
                  <li key={c.id} className="rounded-lg border border-dashed border-slate-300 p-3">
                    <p className="text-sm font-medium text-slate-800">{c.label} <span className="font-normal text-slate-400">· {card}</span></p>
                    <p className="mt-0.5 text-xs text-slate-500">{c.note} Clarify this on the next call.</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <NextButton to="stakeholders" />
    </div>
  );
}
