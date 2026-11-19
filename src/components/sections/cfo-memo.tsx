"use client";

import * as React from "react";
import { Pencil, Eye, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import type { CfoMemo, MemoSection } from "@/lib/documents/types";
import { memoToText } from "@/lib/documents/review";
import { DocumentNotices, ExportBar, GenerateDocuments, usePrivacyScan } from "@/components/documents/doc-shared";
import { NeedsAnalysis, SectionHeader } from "./shared";

const ORIGIN: Record<MemoSection["origin"], { label: string; variant: "teal" | "mock" | "neutral" }> = {
  FACTS: { label: "From your verified facts", variant: "teal" },
  AI: { label: "AI draft · review", variant: "mock" },
  TEMPLATE: { label: "Basic draft · review", variant: "mock" },
  USER: { label: "Edited by you", variant: "neutral" },
};

const inputCls =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15";

function Body({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  const bullets = lines.filter((l) => l.trim().startsWith("•"));
  const paras = lines.filter((l) => !l.trim().startsWith("•"));
  const render = (s: string) =>
    s.split(/(\[[^\]]+\])/).map((part, i) =>
      part.startsWith("[") ? <span key={i} className="rounded bg-amber-50 px-0.5 text-amber-800 print:bg-transparent">{part}</span> : <span key={i}>{part}</span>,
    );
  return (
    <>
      {bullets.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">
          {bullets.map((b, i) => <li key={i} dir="auto">{render(b.replace(/^•\s*/, ""))}</li>)}
        </ul>
      )}
      {paras.map((p, i) => <p key={i} dir="auto" className={cn(bullets.length > 0 && "mt-1 text-[12px] text-slate-500")}>{render(p)}</p>)}
    </>
  );
}

function MemoDocument({ memo, company }: { memo: CfoMemo; company: string }) {
  return (
    <article className="print-doc mx-auto max-w-[210mm] bg-white px-10 py-10 text-[13px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200 sm:px-14">
      <header className="border-b-2 border-slate-900 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Internal memo · for forwarding · draft</p>
        <h1 dir="auto" className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{memo.subject}</h1>
        <dl className="mt-2 grid grid-cols-[60px_1fr] gap-y-0.5 text-[12px]">
          <dt className="text-slate-500">To</dt>
          <dd dir="auto">{memo.to}</dd>
          <dt className="text-slate-500">Re</dt>
          <dd>{company || "Proposed purchase"}</dd>
        </dl>
      </header>
      {memo.sections.map((s) => (
        <section key={s.key} className="doc-section mt-3.5">
          <h2 className="text-[13px] font-semibold text-slate-900">{s.heading}</h2>
          <div className="mt-0.5"><Body text={s.body} /></div>
        </section>
      ))}
      <footer className="mt-6 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        Prepared from the meeting discussion and the vendor&apos;s published product information. Figures are as stated by the vendor; financial benefits require validation by the buyer.
      </footer>
    </article>
  );
}

function MemoEditor({ memo, onChange }: { memo: CfoMemo; onChange: (m: CfoMemo) => void }) {
  const setSection = (key: MemoSection["key"], body: string) =>
    onChange({ ...memo, sections: memo.sections.map((s) => (s.key === key ? { ...s, body, origin: "USER" } : s)) });
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Edit memo</CardTitle>
        <CardDescription>
          Sections 4–6 are built from your verified product facts in code. Start a line with “• ” for a bullet. Text in [brackets] is a placeholder to fill in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-700">
            To
            <input className={cn(inputCls, "mt-1")} value={memo.to} onChange={(e) => onChange({ ...memo, to: e.target.value })} dir="auto" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Subject
            <input className={cn(inputCls, "mt-1")} value={memo.subject} onChange={(e) => onChange({ ...memo, subject: e.target.value })} dir="auto" />
          </label>
        </div>
        {memo.sections.map((s) => (
          <div key={s.key}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">{s.heading}</span>
              <Badge variant={ORIGIN[s.origin].variant} className="font-normal">
                {s.origin === "FACTS" && <Lock />} {ORIGIN[s.origin].label}
              </Badge>
            </div>
            <textarea
              className={cn(inputCls, "field-sizing-content min-h-[64px] resize-y")}
              value={s.body}
              onChange={(e) => setSection(s.key, e.target.value)}
              dir="auto"
              aria-label={s.heading}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CfoMemoSection() {
  const { analysis, documents, setDocuments, input } = useDeal();
  const [mode, setMode] = React.useState<"edit" | "preview">("preview");
  const text = documents ? memoToText(documents.memo) : "";
  const findings = usePrivacyScan([{ label: "CFO memo:", text }]);

  if (!analysis) {
    return (
      <div>
        <SectionHeader id="cfo-memo" />
        <NeedsAnalysis />
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <SectionHeader
          id="cfo-memo"
          actions={
            documents && (
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                <button onClick={() => setMode("edit")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "edit" ? "bg-slate-900 text-white" : "text-slate-600")}><Pencil className="size-3" /> Edit</button>
                <button onClick={() => setMode("preview")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "preview" ? "bg-slate-900 text-white" : "text-slate-600")}><Eye className="size-3" /> Preview</button>
              </div>
            )
          }
        />
      </div>
      {!documents ? (
        <GenerateDocuments />
      ) : (
        <>
          <DocumentNotices docs={documents} />
          <ExportBar text={text} findings={findings} label="memo" />
          <div className={cn(mode === "edit" && "grid gap-4 xl:grid-cols-2")}>
            {mode === "edit" && <MemoEditor memo={documents.memo} onChange={(m) => setDocuments((d) => (d ? { ...d, memo: m } : d))} />}
            <div className={cn(mode === "edit" && "hidden xl:block print:block")}>
              <MemoDocument memo={documents.memo} company={input.productFacts.companyName} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
