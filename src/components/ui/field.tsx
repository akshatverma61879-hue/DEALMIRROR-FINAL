"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/15";

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  hint?: string;
  error?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

/** Labelled text input/textarea with a character counter and inline error. */
export function Field({
  label,
  value,
  onChange,
  max,
  placeholder,
  hint,
  error,
  multiline = false,
  rows = 2,
  className,
}: FieldProps) {
  const id = React.useId();
  const near = value.length > max * 0.8;
  const inputCls = cn(
    base,
    error ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-teal-600",
  );
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-700">
          {label}
        </label>
        {near && (
          <span className={cn("text-[11px] tabular-nums", value.length > max ? "text-red-600" : "text-slate-400")}>
            {value.length}/{max}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, "resize-y py-2")}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, "h-9")}
        />
      )}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}
