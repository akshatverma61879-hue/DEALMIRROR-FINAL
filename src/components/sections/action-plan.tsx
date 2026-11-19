"use client";

import * as React from "react";
import { Plus, Trash2, CheckCircle2, SearchX, Pencil, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { ACTION_STATUSES, type ActionStatus, type BuyerPlan, type PlanItem } from "@/lib/documents/types";
import { label, planToText, TBD, UNASSIGNED } from "@/lib/documents/review";
import { DocumentNotices, ExportBar, GenerateDocuments, usePrivacyScan } from "@/components/documents/doc-shared";
import { NeedsAnalysis, NextButton, SectionHeader } from "./shared";

const STATUS_STYLE: Record<ActionStatus, "green" | "teal" | "amber" | "neutral"> = {
  AGREED: "green",
  COMPLETED: "teal",
  PROPOSED: "amber",
  UNKNOWN: "neutral",
};

const inputCls =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15";

/* ---------------- Buyer-facing document (screen preview + print) ---------------- */

function Table({ rows, kind }: { rows: PlanItem[]; kind: "confirmed" | "proposed" }) {
  return (
    rows.length === 0 ? (
      <p className="text-sm text-slate-500">{kind === "confirmed" ? "No next steps were confirmed on the call yet." : "None."}</p>
    ) : (
      <table className="doc-table w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-600">
            <th className="py-1.5 pr-3">Task</th>
            <th className="py-1.5 pr-3">Owner</th>
            <th className="py-1.5 pr-3">Due</th>
            <th className="py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className="border-b border-slate-200 align-top">
              <td dir="auto" className="py-2 pr-3 text-slate-900">{i.task}</td>
              <td className={cn("py-2 pr-3", i.owner === UNASSIGNED && "text-slate-400")}>{i.owner}</td>
              <td className={cn("py-2 pr-3 whitespace-nowrap", i.due === TBD && "text-slate-400")}>{i.due}</td>
              <td className="py-2 whitespace-nowrap">{label(i.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  );
}

function BuyerPlanDocument({ plan }: { plan: BuyerPlan }) {
  const agreed = plan.items.filter((i) => i.status === "AGREED" || i.status === "COMPLETED");
  const proposed = plan.items.filter((i) => i.status === "PROPOSED" || i.status === "UNKNOWN");
  return (
    <article className="print-doc mx-auto max-w-[210mm] bg-white px-10 py-10 text-slate-800 shadow-sm ring-1 ring-slate-200 sm:px-14">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Mutual action plan · draft for review</p>
        <h1 dir="auto" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{plan.title}</h1>
      </header>

      <section className="doc-section mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Meeting summary</h2>
        <p dir="auto" className="mt-1.5 text-[13px] leading-relaxed">{plan.meetingSummary || "—"}</p>
      </section>

      <section className="doc-section mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Confirmed decisions</h2>
        {plan.decisions.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-slate-500">No decisions were confirmed on the call yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {plan.decisions.map((d, i) => (
              <li key={i} dir="auto">✓ {d.text}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="doc-section mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Agreed next steps</h2>
        <p className="mb-2 text-[11px] text-slate-500">Confirmed during the meeting.</p>
        <Table rows={agreed} kind="confirmed" />
      </section>

      <section className="doc-section mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Proposed next steps</h2>
        <p className="mb-2 text-[11px] text-slate-500">Suggested for your confirmation. Not yet agreed. “TBD” means no date has been confirmed.</p>
        <Table rows={proposed} kind="proposed" />
      </section>

      <section className="doc-section mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Open questions</h2>
        {plan.openQuestions.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-slate-500">None.</p>
        ) : (
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px]">
            {plan.openQuestions.map((q, i) => <li key={i} dir="auto">{q}</li>)}
          </ul>
        )}
      </section>
    </article>
  );
}

/* ---------------- Editor ---------------- */

function PlanEditor({ plan, onChange }: { plan: BuyerPlan; onChange: (p: BuyerPlan) => void }) {
  const setItem = (id: string, patch: Partial<PlanItem>) =>
    onChange({ ...plan, items: plan.items.map((i) => (i.id === id ? { ...i, ...patch, edited: true } : i)) });
  const addItem = () =>
    onChange({
      ...plan,
      items: [
        ...plan.items,
        { id: `u-${Date.now()}`, task: "", owner: UNASSIGNED, status: "PROPOSED", due: TBD, evidence: null, justification: "Added by you.", source: "USER", edited: true },
      ],
    });

  return (
    <div className="space-y-4 print:hidden">
      <Card>
        <CardHeader>
          <CardTitle>Title and summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input className={inputCls} value={plan.title} onChange={(e) => onChange({ ...plan, title: e.target.value })} aria-label="Document title" />
          <textarea className={cn(inputCls, "min-h-[90px]")} value={plan.meetingSummary} onChange={(e) => onChange({ ...plan, meetingSummary: e.target.value })} aria-label="Meeting summary" dir="auto" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>
              Agreed and Completed need a transcript quote. Everything the AI suggested is Proposed. Empty date → TBD, empty owner → Unassigned.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={addItem}><Plus /> Add task</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-[32%] px-4 py-2">Task</th>
                <th className="px-2 py-2">Owner</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Due</th>
                <th className="w-[26%] px-2 py-2">Evidence / justification</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {plan.items.map((i) => {
                const hasEvidence = !!i.evidence?.verified;
                return (
                  <tr key={i.id} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-2">
                      <textarea rows={2} dir="auto" className={cn(inputCls, "field-sizing-content resize-none")} value={i.task} placeholder="Describe the task" onChange={(e) => setItem(i.id, { task: e.target.value })} aria-label="Task" />
                      <div className="mt-1 flex gap-1">
                        <Badge variant={i.source === "USER" ? "neutral" : "mock"} className="font-normal">{i.source === "AI" ? "AI draft" : i.source === "TEMPLATE" ? "Basic draft" : "Added by you"}</Badge>
                        {i.edited && i.source !== "USER" && <Badge variant="neutral" className="font-normal"><Pencil /> Edited</Badge>}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={i.owner === UNASSIGNED ? "" : i.owner} placeholder={UNASSIGNED} onChange={(e) => setItem(i.id, { owner: e.target.value.trim() ? e.target.value : UNASSIGNED })} aria-label="Owner" />
                    </td>
                    <td className="px-2 py-2">
                      <select className={inputCls} value={i.status} onChange={(e) => setItem(i.id, { status: e.target.value as ActionStatus })} aria-label="Status">
                        {ACTION_STATUSES.map((s) => (
                          <option key={s} value={s} disabled={(s === "AGREED" || s === "COMPLETED") && !hasEvidence}>
                            {label(s)}{(s === "AGREED" || s === "COMPLETED") && !hasEvidence ? " (needs transcript evidence)" : ""}
                          </option>
                        ))}
                      </select>
                      <Badge variant={STATUS_STYLE[i.status]} className="mt-1">{label(i.status)}</Badge>
                    </td>
                    <td className="px-2 py-2">
                      <input className={cn(inputCls, "w-36")} value={i.due === TBD ? "" : i.due} placeholder={TBD} onChange={(e) => setItem(i.id, { due: e.target.value.trim() ? e.target.value : TBD })} aria-label="Due date" />
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">
                      {i.evidence ? (
                        <p dir="auto" className="italic">
                          {i.evidence.verified ? <CheckCircle2 className="mr-1 inline size-3 text-emerald-500" /> : <SearchX className="mr-1 inline size-3 text-amber-600" />}
                          “{i.evidence.quote}”{i.evidence.line ? ` · line ${i.evidence.line}` : ""}
                        </p>
                      ) : (
                        <p>No transcript quote</p>
                      )}
                      {i.justification && <p className="mt-1" dir="auto">{i.justification}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => onChange({ ...plan, items: plan.items.filter((x) => x.id !== i.id) })} aria-label="Delete task">
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Open questions</CardTitle>
            <CardDescription>Confirmed decisions need a transcript quote and are kept as generated.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => onChange({ ...plan, openQuestions: [...plan.openQuestions, ""] })}><Plus /> Add</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan.openQuestions.map((q, n) => (
            <div key={n} className="flex gap-2">
              <input dir="auto" className={inputCls} value={q} onChange={(e) => onChange({ ...plan, openQuestions: plan.openQuestions.map((x, k) => (k === n ? e.target.value : x)) })} aria-label={`Open question ${n + 1}`} />
              <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onChange({ ...plan, openQuestions: plan.openQuestions.filter((_, k) => k !== n) })} aria-label="Remove question"><Trash2 /></Button>
            </div>
          ))}
          {plan.decisions.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-semibold text-slate-700">Confirmed decisions</p>
              {plan.decisions.map((d, n) => (
                <p key={n} dir="auto" className="text-sm text-slate-700">✓ {d.text} <span className="text-xs italic text-slate-400">“{d.evidence.quote}” · line {d.evidence.line}</span></p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ActionPlanSection() {
  const { analysis, documents, setDocuments } = useDeal();
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const plan = documents?.plan;
  const cleanPlan = React.useMemo(
    () => (plan ? { ...plan, items: plan.items.filter((i) => i.task.trim()), openQuestions: plan.openQuestions.filter((q) => q.trim()) } : null),
    [plan],
  );
  const text = cleanPlan ? planToText(cleanPlan) : "";
  const findings = usePrivacyScan([{ label: "Action plan:", text }]);

  if (!analysis) {
    return (
      <div>
        <SectionHeader id="action-plan" />
        <NeedsAnalysis />
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <SectionHeader
          id="action-plan"
          actions={
            documents && (
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                <button onClick={() => setMode("edit")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "edit" ? "bg-slate-900 text-white" : "text-slate-600")}><Pencil className="size-3" /> Edit</button>
                <button onClick={() => setMode("preview")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "preview" ? "bg-slate-900 text-white" : "text-slate-600")}><Eye className="size-3" /> Buyer preview</button>
              </div>
            )
          }
        />
      </div>
      {!documents || !cleanPlan ? (
        <GenerateDocuments />
      ) : (
        <>
          <DocumentNotices docs={documents} />
          <ExportBar text={text} findings={findings} label="plan" />
          {mode === "edit" && (
            <PlanEditor plan={documents.plan} onChange={(p) => setDocuments((d) => (d ? { ...d, plan: p } : d))} />
          )}
          <div className={cn(mode === "edit" ? "mt-6 hidden lg:block print:block" : "")}>
            {mode === "edit" && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 print:hidden">Buyer preview</p>}
            <BuyerPlanDocument plan={cleanPlan} />
          </div>
        </>
      )}
      <NextButton to="cfo-memo" />
    </div>
  );
}
