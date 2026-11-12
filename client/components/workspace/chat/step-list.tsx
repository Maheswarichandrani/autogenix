"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A step from either the live feed or a saved message. */
export interface StepView {
  id: string;
  status: string;
  input?: string;
  result?: string;
  isError?: boolean;
  pending?: boolean;
}

function StepRow({ step }: { step: StepView }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(step.input || step.result);

  return (
    <li>
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
          hasDetail ? "hover:bg-accent/60" : "cursor-default",
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {step.pending ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : step.isError ? (
            <AlertCircle className="size-3.5 text-destructive" />
          ) : (
            <Check className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className={cn("min-w-0 flex-1 truncate", step.isError ? "text-destructive" : "text-muted-foreground")}>
          {step.status}
        </span>
        {hasDetail && (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:text-muted-foreground",
              open && "rotate-90",
            )}
          />
        )}
      </button>

      {open && hasDetail && (
        <div className="mt-1 mb-2 ml-8 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {step.input && <Detail label="Input" text={step.input} />}
          {step.result && <Detail label={step.isError ? "Error" : "Result"} text={step.result} error={step.isError} />}
        </div>
      )}
    </li>
  );
}

function Detail({ label, text, error }: { label: string; text: string; error?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="border-b border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <pre
        className={cn(
          "max-h-56 overflow-auto px-2.5 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all",
          error ? "text-destructive/90" : "text-muted-foreground",
        )}
      >
        {text}
      </pre>
    </div>
  );
}

/** Flat list of tool steps, each expandable to its input and result. */
export function StepList({ steps }: { steps: StepView[] }) {
  if (steps.length === 0) return null;
  return (
    <ul className="ml-1 space-y-0.5 border-l border-border pl-2.5">
      {steps.map((s) => (
        <StepRow key={s.id} step={s} />
      ))}
    </ul>
  );
}
