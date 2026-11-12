"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { summariseSteps } from "@/lib/step-summary";
import { cn } from "@/lib/utils";
import { StepList, type StepView } from "./step-list";

/** "Wrote 3 files, ran 2 commands, and 1 more tool ›" — expands to the steps. */
export function StepSummary({ steps, tools }: { steps: StepView[]; tools: string[] }) {
  const [open, setOpen] = useState(false);
  const text = summariseSteps(tools);
  if (!text) return null;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group inline-flex max-w-full items-center gap-1 text-left text-[15px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="truncate">{text}</span>
        <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <StepList steps={steps} />
        </div>
      )}
    </div>
  );
}
