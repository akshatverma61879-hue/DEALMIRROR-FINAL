"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsiblePanelProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "private";
  children: React.ReactNode;
}

export function CollapsiblePanel({
  title,
  description,
  icon,
  meta,
  defaultOpen = false,
  tone = "default",
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <div
      className={cn(
        "rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        tone === "private" ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        {icon && <span className="mt-0.5 text-slate-500">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          {description && <span className="mt-0.5 block text-sm text-slate-500">{description}</span>}
        </span>
        {meta && <span className="shrink-0">{meta}</span>}
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} className="border-t border-slate-200/80 px-5 pb-5 pt-4">
        {children}
      </div>
    </div>
  );
}
