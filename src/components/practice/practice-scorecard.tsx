"use client";

import { CheckCircle2, XCircle, Lightbulb, ShieldAlert, Quote, Lock, Copy, Check, SearchX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/charts/score-gauge";
import { cn } from "@/lib/utils";
import type { Scorecard } from "@/lib/practice/types";
import { useCopy } from "@/components/sections/shared";

export function PracticeScorecard({ card }: { card: Scorecard }) {
  const { copied, copy } = useCopy();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="flex flex-col items-center p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Practice score</p>
          <ScoreGauge score={card.overall} label="out of 100" size={200} variant="full" name="Practice" tone={card.overall >= 70 ? "green" : card.overall >= 40 ? "amber" : "red"} />
          <p className="mt-4 text-center text-xs text-slate-500">
            Weighted in code from the rubric below. Shows better practice, not a higher chance of winning.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rubric</CardTitle>
            <CardDescription>The coach scores each area 0–10 with evidence from your replies. Code checks can cap a score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {card.dimensions.map((d) => (
              <div key={d.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">
                    {d.label} <span className="font-normal text-slate-400">· weight {d.weight}</span>
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {d.score}/10{d.cappedBy && <span className="ml-1 text-xs text-red-600">(capped from {d.aiScore})</span>}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full rounded-full", d.score < 4 ? "bg-red-500" : d.score < 7 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${d.score * 10}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{d.reason}</p>
                {d.cappedBy && <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600"><Lock className="size-3" /> {d.cappedBy}</p>}
                {d.evidence && (
                  <p dir="auto" className="mt-0.5 flex items-start gap-1 text-xs italic text-slate-500">
                    {d.evidence.verified ? <Quote className="mt-px size-3 shrink-0" /> : <SearchX className="mt-px size-3 shrink-0 text-amber-600" />}
                    “{d.evidence.quote}”{!d.evidence.verified && <span className="not-italic text-amber-700"> (not found in your replies)</span>}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {card.ruleViolations.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-800"><ShieldAlert className="size-4" /> Private sales rule issues</CardTitle>
            <CardDescription>Visible only to you. Never shown to the buyer.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-red-800">
              {card.ruleViolations.map((v) => <li key={v}>• {v}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Strengths", items: card.strengths, Icon: CheckCircle2, color: "text-emerald-600" },
          { title: "Weaknesses", items: card.weaknesses, Icon: XCircle, color: "text-red-500" },
          { title: "How to improve", items: card.suggestions, Icon: Lightbulb, color: "text-teal-700" },
        ].map(({ title, items, Icon, color }) => (
          <Card key={title}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2"><Icon className={cn("size-4", color)} /> {title}</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length ? (
                <ul className="space-y-1.5 text-sm text-slate-700">{items.map((s) => <li key={s}>• {s}</li>)}</ul>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Example of a stronger response</CardTitle>
            <CardDescription>Uses only your public product facts. Checked in code for discounts, private figures and unsupported numbers.</CardDescription>
          </div>
          {card.strongerResponse.text && (
            <Button variant="outline" size="sm" onClick={() => copy("sr", card.strongerResponse.text)}>
              {copied === "sr" ? <Check /> : <Copy />} Copy
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {card.strongerResponse.withheld ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">The example was withheld because it broke one of your rules.</p>
          ) : (
            <p dir="auto" className="rounded-lg bg-teal-50/70 p-3.5 text-sm leading-relaxed text-teal-950">{card.strongerResponse.text || "—"}</p>
          )}
          {card.strongerResponse.warnings.map((w) => (
            <p key={w} className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"><ShieldAlert className="mt-px size-3.5 shrink-0" /> {w}</p>
          ))}
          <Badge variant="neutral" className="font-normal">Coached by {card.model}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
