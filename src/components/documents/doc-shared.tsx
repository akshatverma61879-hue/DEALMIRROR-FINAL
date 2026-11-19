"use client";

import * as React from "react";
import { Loader2, Sparkles, AlertOctagon, RefreshCw, FileText, ShieldCheck, ShieldAlert, Copy, Check, Printer, Info, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeal } from "@/components/deal-context";
import { postJson, type ApiError } from "@/lib/practice/client";
import { scanForPrivateInfo, templateDocuments, toBuyerDocumentInput, type PrivacyFinding } from "@/lib/documents/build";
import { factsText } from "@/lib/documents/review";
import type { GeneratedDocuments } from "@/lib/documents/types";
import { useCopy } from "@/components/sections/shared";

/** Shown until documents exist. Generates both documents in one request. */
export function GenerateDocuments() {
  const { analysis, input, setDocuments } = useDeal();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  if (!analysis) return null;

  const generate = async () => {
    setLoading(true);
    setError(null);
    // Only the isolated buyer-document input is sent. Private rules never leave the browser here.
    const res = await postJson<{ documents: GeneratedDocuments }>("api/documents", toBuyerDocumentInput(analysis, input), 95_000);
    setLoading(false);
    if (res.data) setDocuments(res.data.documents);
    else setError(res.error ?? { code: "UNEXPECTED", message: "Could not create the documents." });
  };

  const template = () => setDocuments(templateDocuments(analysis, toBuyerDocumentInput(analysis, input)));

  return (
    <Card className="p-8">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-teal-50">
          <FileText className="size-5 text-teal-700" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Create the mutual action plan and CFO memo</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Drafted from your transcript, analysis and verified product facts. Your private sales rules, your meeting notes,
          marketing claims and the deal health score are excluded in code. Nothing is sent to the buyer: you review,
          edit, then copy or print.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Drafting documents…" : "Draft documents"}
          </Button>
        </div>
        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800">
            <p className="flex items-start gap-2"><AlertOctagon className="mt-0.5 size-4 shrink-0" /> {error.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={generate}><RefreshCw /> Try again</Button>
              <Button size="sm" variant="outline" onClick={template}><FileText /> Create a basic draft without AI</Button>
            </div>
            <p className="mt-2 text-xs text-red-700/80">The basic draft uses only your analysis: every task is Proposed, dates TBD, owners Unassigned.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export function usePrivacyScan(docs: { label: string; text: string }[]): PrivacyFinding[] {
  const { input } = useDeal();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { marketingClaims, ...verified } = input.productFacts;
  const publicText = input.transcript + "\n" + factsText(verified);
  const key = docs.map((d) => d.text).join("\u0000");
  return React.useMemo(
    () => scanForPrivateInfo(docs, input.privateRules, input.impression.text, publicText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, input.privateRules, input.impression.text, publicText],
  );
}

export function DocumentNotices({ docs }: { docs: GeneratedDocuments }) {
  return (
    <div className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 print:hidden">
      <p className="flex gap-2 text-xs text-slate-600">
        <Info className="mt-px size-3.5 shrink-0 text-slate-400" />
        {docs.generatedBy === "sarvam"
          ? `Drafted by ${docs.model}, then checked in code.`
          : docs.generatedBy === "sample"
            ? "Sample Demo — Fictional Data. Pre-computed documents, not live AI."
            : "Basic draft built without AI."}{" "}
        Review before sharing. Nothing is sent automatically.
      </p>
      {docs.notices.map((n) => (
        <p key={n} className="flex gap-2 text-xs text-slate-600"><Info className="mt-px size-3.5 shrink-0 text-slate-400" /> {n}</p>
      ))}
    </div>
  );
}

/** Privacy badge + copy/print buttons. Copy and print stay disabled while a finding is open. */
export function ExportBar({ text, findings, label }: { text: string; findings: PrivacyFinding[]; label: string }) {
  const { copied, copy } = useCopy();
  const blocked = findings.length > 0;
  return (
    <div className="mb-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {blocked ? (
          <Badge variant="red"><ShieldAlert /> Privacy review: {findings.length} issue{findings.length > 1 ? "s" : ""} to fix</Badge>
        ) : (
          <Badge variant="green"><ShieldCheck /> Privacy review passed · no private rules, notes or score</Badge>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={blocked} onClick={() => copy(label, text)}>
            {copied === label ? <Check /> : <Copy />} {copied === label ? "Copied" : "Copy document"}
          </Button>
          <Button size="sm" disabled={blocked} onClick={() => window.print()} title="Opens the print dialog. Choose “Save as PDF” as the destination.">
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>
      {blocked && (
        <div role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="flex items-center gap-1.5 font-medium"><Lock className="size-3.5" /> Copy and print are paused until these lines are edited:</p>
          <ul className="mt-1 space-y-1">
            {findings.map((f, i) => (
              <li key={i} className="text-xs">
                <span className="font-medium">{f.where}</span> {f.reason}: “{f.excerpt}”
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-slate-400">In the print dialog choose “Save as PDF”. Layout is A4; navigation and buttons are hidden.</p>
    </div>
  );
}
