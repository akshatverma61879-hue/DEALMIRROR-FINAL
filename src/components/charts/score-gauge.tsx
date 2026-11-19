"use client";

import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { ScoreCard } from "@/lib/types";

export type Tone = ScoreCard["bandTone"];

/** Colour for a score's band. The band already encodes direction (high Illusion risk is red). */
export function toneColor(tone: Tone) {
  if (tone === "red") return { hex: "#dc2626", text: "text-red-600" };
  if (tone === "amber") return { hex: "#d97706", text: "text-amber-600" };
  if (tone === "green") return { hex: "#059669", text: "text-emerald-600" };
  return { hex: "#94a3b8", text: "text-slate-500" };
}

interface ScoreGaugeProps {
  score: number;
  label?: string;
  simulated?: boolean;
  size?: number;
  /** "full" = circular gauge (dashboard), "semi" = half gauge (compact). */
  variant?: "full" | "semi";
  tone?: Tone;
  /** Accessible name of the score, e.g. "Deal Health". */
  name?: string;
}

export function ScoreGauge({ score, label, simulated = false, size = 220, variant = "semi", tone = "neutral", name = "Deal health" }: ScoreGaugeProps) {
  const color = simulated ? toneColor("neutral") : toneColor(tone);
  const full = variant === "full";
  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: full ? size : size * 0.62 }}
      role="img"
      aria-label={`${simulated ? "Hypothetical " : ""}${name} score ${score} out of 100`}
    >
      <ResponsiveContainer width="100%" height={size}>
        <RadialBarChart
          innerRadius={full ? "80%" : "78%"}
          outerRadius="100%"
          data={[{ value: score }]}
          startAngle={full ? 90 : 180}
          endAngle={full ? -270 : 0}
          cy="50%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            background={{ fill: "#f1f5f9" }}
            fill={color.hex}
            isAnimationActive
            animationDuration={600}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div
        className={cn(
          "absolute inset-x-0 flex flex-col items-center",
          full ? "top-1/2 -translate-y-1/2" : "bottom-0",
        )}
      >
        <span className={cn("font-semibold tabular-nums tracking-tight", full ? "text-6xl" : "text-5xl", color.text)}>
          {score}
        </span>
        {label && <span className="mt-0.5 text-xs font-medium text-slate-500">{label}</span>}
      </div>
    </div>
  );
}
