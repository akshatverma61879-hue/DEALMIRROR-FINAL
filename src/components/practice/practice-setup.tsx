"use client";

import * as React from "react";
import { Loader2, Play, AlertOctagon, RefreshCw, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ObjectionStatusBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { LANGUAGES, type Language } from "@/lib/types";
import type { Persona } from "@/lib/practice/types";
import { buildPracticeContext, newId, postJson, unresolvedObjections, type ApiError } from "@/lib/practice/client";
import type { BuyerTone } from "@/lib/practice/tone";
import { scriptedOpening } from "@/lib/practice/scripted";
import { SAMPLE_PERSONA } from "@/lib/sample-deal";

export function LanguagePicker({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Practice language">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === l ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function PracticeSetup() {
  const { analysis, input, setPractice } = useDeal();
  const options = analysis ? unresolvedObjections(analysis) : [];
  const [selected, setSelected] = React.useState(options[0]?.id ?? "");
  const [language, setLanguage] = React.useState<Language>(input.language);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  if (!analysis) return null;

  if (options.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-slate-500">
        Every objection in this call was resolved with evidence, so there is nothing to practise. Try another transcript.
      </Card>
    );
  }

  const isSample = analysis.source === "sample";

  const startScripted = () => {
    const objection = options.find((o) => o.id === selected) ?? options[0];
    const context = buildPracticeContext(analysis, input, objection, language);
    const opening = { id: newId(), role: "buyer" as const, text: scriptedOpening(language), stance: "SCEPTICAL" as const, tone: "SCEPTICAL" as const };
    setPractice({ mode: "scripted", objectionId: objection.id, context, persona: SAMPLE_PERSONA, opening, messages: [opening], scorecard: null });
  };

  const start = async () => {
    const objection = options.find((o) => o.id === selected) ?? options[0];
    const context = buildPracticeContext(analysis, input, objection, language);
    setLoading(true);
    setError(null);
    const res = await postJson<{ persona: Persona; opening: string; openingTone?: BuyerTone }>("api/practice/start", context);
    setLoading(false);
    if (!res.data) return setError(res.error ?? { code: "UNEXPECTED", message: "Could not start practice." });
    const opening = { id: newId(), role: "buyer" as const, text: res.data.opening, stance: "SCEPTICAL" as const, tone: res.data.openingTone ?? ("SCEPTICAL" as const) };
    setPractice({ mode: "live", objectionId: objection.id, context, persona: res.data.persona, opening, messages: [opening], scorecard: null });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>1 · Choose an unresolved objection</CardTitle>
          <CardDescription>From your call analysis. The buyer will re-raise it so you can practise the moment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2" role="radiogroup" aria-label="Objection to practise">
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={selected === o.id}
              onClick={() => setSelected(o.id)}
              className={cn(
                "w-full rounded-lg border p-3.5 text-left transition-colors",
                selected === o.id ? "border-teal-600 bg-teal-50/50 ring-1 ring-teal-600" : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span dir="auto" className="text-sm font-semibold text-slate-900">{o.title}</span>
                <ObjectionStatusBadge status={o.status} />
              </div>
              <p dir="auto" className="mt-1.5 text-sm italic text-slate-600">“{o.buyerConcern.quote}”</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle>2 · Practice language</CardTitle>
          <CardDescription>The fictional buyer will speak in this language.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LanguagePicker value={language} onChange={setLanguage} />
          <ul className="space-y-1.5 text-xs text-slate-500">
            <li>• The buyer is a <strong className="font-medium text-slate-700">fictional persona</strong> based on your call, not the real buyer.</li>
            <li>• Turn-by-turn: the buyer replies after each of your answers.</li>
            <li>• Answer by typing, or by microphone where your browser supports it.</li>
            <li>• Your private sales rules are never shown to the buyer or sent to a voice service.</li>
          </ul>
          {isSample && (
            <div className="space-y-1.5">
              <Button className="w-full" size="lg" onClick={startScripted}>
                <FlaskConical /> Start scripted sample practice
              </Button>
              <p className="text-center text-[11px] text-slate-500">Sample Demo — Fictional Data · rule-based buyer, no AI needed</p>
            </div>
          )}
          <Button className="w-full" size="lg" variant={isSample ? "outline" : "default"} onClick={start} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Play />}
            {loading ? "Creating your practice buyer…" : isSample ? "Start with live AI buyer" : "Start practice"}
          </Button>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="flex items-start gap-2"><AlertOctagon className="mt-0.5 size-4 shrink-0" /> {error.message}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={start}><RefreshCw /> Try again</Button>
            </div>
          )}
          <Badge variant="neutral" className="font-normal">Your analysis is kept; practice needs no new analysis.</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
