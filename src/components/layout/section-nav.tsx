"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { SECTIONS } from "./sections";

export function SectionNav() {
  const { section, setSection, analysis } = useDeal();
  const groups = ["Analyse", "Coach", "Documents"] as const;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sticky top-20 hidden w-56 shrink-0 self-start lg:block print:hidden" aria-label="Sections">
        {groups.map((g) => (
          <div key={g} className="mb-5">
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g}</p>
            <ul className="space-y-0.5">
              {SECTIONS.filter((s) => s.group === g).map((s) => {
                const locked = s.id !== "input" && !analysis;
                const active = section === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSection(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-teal-50 font-medium text-teal-800"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                        locked && !active && "text-slate-400",
                      )}
                    >
                      <s.icon className={cn("size-4", active ? "text-teal-700" : "text-slate-400")} />
                      <span className="flex-1">{s.label}</span>
                      {locked && <Lock className="size-3 text-slate-300" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Mobile / tablet tabs */}
      <nav className="-mx-4 mb-4 overflow-x-auto px-4 lg:hidden print:hidden" aria-label="Sections">
        <div className="flex w-max gap-1.5">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                  active
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                <s.icon className="size-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
