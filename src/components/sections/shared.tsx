"use client";

import * as React from "react";
import { ArrowRight, Info, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeal } from "@/components/deal-context";
import { SECTIONS } from "@/components/layout/sections";
import type { SectionId } from "@/lib/types";
import { MockBadge } from "@/components/ui/status";

export function SectionHeader({
  id,
  actions,
  mock = false,
}: {
  id: SectionId;
  actions?: React.ReactNode;
  mock?: boolean;
}) {
  const meta = SECTIONS.find((s) => s.id === id)!;
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{meta.label}</h1>
          {mock && <MockBadge />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{meta.description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function NextButton({ to, label }: { to: SectionId; label?: string }) {
  const { setSection } = useDeal();
  const meta = SECTIONS.find((s) => s.id === to)!;
  return (
    <div className="mt-6 flex justify-end print:hidden">
      <Button onClick={() => setSection(to)}>
        {label ?? `Next: ${meta.label}`} <ArrowRight />
      </Button>
    </div>
  );
}

export function NeedsAnalysis() {
  const { setSection } = useDeal();
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100">
        <FileText className="size-5 text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-900">No call analysed yet</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Paste a transcript (or load the sample) and click “Analyse this call” to fill this section.
      </p>
      <Button className="mt-5" variant="outline" onClick={() => setSection("input")}>
        Go to Deal Input
      </Button>
    </div>
  );
}

export function NotConnected({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
      <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div>{children}</div>
    </div>
  );
}

export function Quote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <blockquote
      className={`border-l-2 border-slate-300 pl-3 text-sm italic leading-relaxed text-slate-600 ${className}`}
    >
      “{children}”
    </blockquote>
  );
}

export function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = React.useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }, []);
  return { copied, copy };
}
