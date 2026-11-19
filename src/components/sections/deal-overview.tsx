"use client";

import { AlertTriangle, CalendarX2, CalendarCheck2, EyeOff, Gauge, UserCheck, UserX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import type { ScoreCard } from "@/lib/types";

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "red" | "amber" | "green";
}) {
  const toneText = {
    neutral: "text-slate-300",
    red: "text-red-600",
    amber: "text-amber-600",
    green: "text-emerald-600",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className="size-4 text-slate-400" />
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", toneText)}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>
    </Card>
  );
}

function scoreKpi(card: ScoreCard) {
  return {
    value: card.score === null ? "—" : `${card.score}/100`,
    sub: card.cap ? `${card.band} · capped` : card.band,
    tone: (card.bandTone === "neutral" ? "amber" : card.bandTone) as "red" | "amber" | "green",
  };
}

export function DealOverview() {
  const { analysis, scores } = useDeal();
  const grid = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 print:hidden";

  if (!analysis || !scores) {
    return (
      <div className={grid}>
        <Kpi label="Deal Health" value="—" sub="Awaiting analysis" icon={Gauge} />
        <Kpi label="Salesperson" value="—" sub="Awaiting analysis" icon={UserCheck} />
        <Kpi label="Illusion risk" value="—" sub="Awaiting analysis" icon={EyeOff} />
        <Kpi label="Unresolved objections" value="—" sub="Awaiting analysis" icon={AlertTriangle} />
        <Kpi label="Missing stakeholders" value="—" sub="Awaiting analysis" icon={UserX} />
        <Kpi label="Next step" value="—" sub="Awaiting analysis" icon={CalendarX2} />
      </div>
    );
  }

  const unresolved = analysis.objections.filter((o) => o.status !== "RESOLVED_WITH_EVIDENCE").length;
  const missing = analysis.stakeholders.filter((s) => s.status === "MENTIONED_ONLY");
  const next = analysis.findings.next_step_agreed.value;
  const deal = scoreKpi(scores.deal);
  const seller = scoreKpi(scores.seller);
  const illusion = scoreKpi(scores.illusion);

  return (
    <div className={grid}>
      <Kpi label="Deal Health" value={deal.value} sub={`${deal.sub} · ${analysis.dealName}`} icon={Gauge} tone={deal.tone} />
      <Kpi label="Salesperson" value={seller.value} sub={seller.sub} icon={UserCheck} tone={seller.tone} />
      <Kpi label="Illusion risk" value={illusion.value} sub={illusion.sub} icon={EyeOff} tone={illusion.tone} />
      <Kpi
        label="Unresolved objections"
        value={analysis.objections.length ? `${unresolved} of ${analysis.objections.length}` : "0"}
        sub={analysis.objections.length ? "Not resolved with evidence" : "No objections found"}
        icon={AlertTriangle}
        tone={unresolved ? "red" : "green"}
      />
      <Kpi
        label="Missing stakeholders"
        value={String(missing.length)}
        sub={missing.length ? missing.map((m) => m.name).join(", ") + " not on the call" : "Everyone needed was present"}
        icon={UserX}
        tone={missing.length ? "amber" : "green"}
      />
      <Kpi
        label="Next step"
        value={next === "yes" ? "Agreed" : next === "no" ? "None agreed" : "Unclear"}
        sub={next === "yes" ? "Specific action agreed by both sides" : next === "no" ? "Call ended without an agreed action" : "Not confirmed by a verified quote"}
        icon={next === "yes" ? CalendarCheck2 : CalendarX2}
        tone={next === "yes" ? "green" : next === "no" ? "red" : "amber"}
      />
    </div>
  );
}
