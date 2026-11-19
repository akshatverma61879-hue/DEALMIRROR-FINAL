"use client";

import { Badge } from "@/components/ui/badge";
import { ResetSessionButton } from "@/components/reset-session";
import { useDeal } from "@/components/deal-context";
import { TrySampleButton } from "@/components/demo/demo-tour";
import { SAMPLE_LABEL } from "@/lib/sample-deal";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex size-8 items-center justify-center rounded-lg bg-teal-700">
        <div className="absolute left-1.5 top-1.5 h-5 w-2 rounded-sm bg-white/90" />
        <div className="absolute right-1.5 top-1.5 h-5 w-2 rounded-sm bg-white/40" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">DealMirror</span>
    </div>
  );
}

function SourceBadge() {
  const { analysis } = useDeal();
  if (!analysis) return null;
  return analysis.source === "sample" ? (
    <Badge variant="amber">{SAMPLE_LABEL}</Badge>
  ) : (
    <Badge variant="neutral" className="hidden sm:inline-flex">Live analysis</Badge>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <p className="hidden truncate text-sm text-slate-500 sm:block">
            See what your buyer actually said.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="teal" className="hidden sm:inline-flex">AI Sales Intelligence</Badge>
          <SourceBadge />
          <TrySampleButton className="hidden md:inline-flex" />
          <ResetSessionButton />
        </div>
      </div>
    </header>
  );
}
