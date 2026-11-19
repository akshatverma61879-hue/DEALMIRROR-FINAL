"use client";

import * as React from "react";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeal } from "@/components/deal-context";

/** Reset Session button + confirmation dialog (built in-page; no browser confirm()). */
export function ResetSessionButton({ compact = false }: { compact?: boolean }) {
  const { reset } = useDeal();
  const [open, setOpen] = React.useState(false);
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Reset session">
        <RotateCcw /> {!compact && <span className="hidden sm:inline">Reset session</span>}
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="reset-title" className="text-base font-semibold text-slate-900">
                Reset this session?
              </h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This clears the transcript, product facts, private sales rules, your meeting impression and all
              results from this screen. DealMirror does not save your session anywhere else, so it cannot be
              recovered.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                ref={confirmRef}
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Reset session
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
