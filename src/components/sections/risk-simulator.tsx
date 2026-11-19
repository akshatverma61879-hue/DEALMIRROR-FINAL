"use client";

import * as React from "react";
import { Check, RotateCcw, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/charts/score-gauge";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { bandFor, gaps, recoverable, simulateScore } from "@/lib/scoring";
import { NeedsAnalysis, NextButton, SectionHeader } from "./shared";

export const HYPOTHETICAL_LABEL = "Hypothetical scenario — actions not yet completed.";

export function RiskSimulatorSection() {
  const { analysis, scores } = useDeal();
  // A Set guarantees an action can be applied at most once.
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  if (!analysis || !scores) {
    return (
      <div>
        <SectionHeader id="simulator" />
        <NeedsAnalysis />
      </div>
    );
  }

  // Only gaps actually found in this analysis: Deal Health criteria that lost points, plus a cap.
  const card = scores.deal;
  const actions = [
    ...(card.cap && card.cap.recoveryAction ? [{ id: card.cap.ruleId, action: card.cap.recoveryAction, label: card.cap.label, points: null as number | null }] : []),
    ...gaps(card).map((c) => ({ id: c.id, action: c.recoveryAction, label: c.label, points: recoverable(c) as number | null })),
  ];
  const validSelected = new Set([...selected].filter((id) => actions.some((a) => a.id === id)));
  const simulated = simulateScore(card, validSelected);
  const real = card.score;
  const gained = simulated !== null && real !== null ? simulated - real : 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <SectionHeader
        id="simulator"
        actions={
          validSelected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <RotateCcw /> Clear scenario
            </Button>
          )
        }
      />

      {real === null || simulated === null ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Deal Health has insufficient evidence, so there is nothing reliable to simulate. See Deal Health for what could not be judged.
        </Card>
      ) : actions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No Deal Health gaps were found in the judged criteria, so there is nothing to simulate. The score is {real}.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Recovery actions</CardTitle>
                <CardDescription>Only Deal Health gaps found in this analysis. Each action counts once.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {actions.map((d) => {
                  const on = validSelected.has(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggle(d.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
                        on ? "border-teal-600 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
                          on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white",
                        )}
                      >
                        {on && <Check className="size-3.5" />}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-slate-800">{d.action}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{d.points === null ? "Lifts the cap" : "Closes"}: {d.label}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-emerald-700">{d.points === null ? "cap" : `up to +${Math.round(d.points)}`}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Card className="flex flex-col items-center p-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Real score</p>
                <ScoreGauge score={real} size={190} tone={card.bandTone} name="Deal Health" />
                <Badge variant="neutral" className="mt-4">From the transcript · {card.band}</Badge>
                <p className="mt-2 text-center text-[11px] text-slate-400">Never changes in the simulator.</p>
              </Card>
              <Card className="flex flex-col items-center border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 shadow-none">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Simulated score</p>
                <ScoreGauge score={simulated} size={190} simulated name="Deal Health" />
                <Badge variant="mock" className="mt-4"><FlaskConical /> {gained > 0 ? `+${gained} · would be ${bandFor("deal", simulated).label}` : "No actions selected"}</Badge>
                <p className="mt-2 text-center text-xs font-medium text-slate-600">{HYPOTHETICAL_LABEL}</p>
              </Card>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Simulated scores show what Deal Health would be if these gaps were fully closed, with the same judged criteria. Combined actions can differ slightly from the sum because of rounding. They are not completed actions and not a probability of winning. Maximum 100.
          </p>
        </>
      )}

      <NextButton to="practice" />
    </div>
  );
}
