"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StepList, type StepView } from "./step-list";

function useElapsedSeconds(since: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : null;
}

/**
 * The single live line while an agent works: pulsing dot, what it is doing,
 * how long the current step has taken, and › to see every step so far.
 */
export function LiveStatus({
  label,
  since,
  steps,
}: {
  label: string;
  since?: number;
  steps: StepView[];
}) {
  const [open, setOpen] = useState(false);
  const seconds = useElapsedSeconds(since);
  const canExpand = steps.length > 0;

  return (
    <div className="py-1" role="status" aria-live="polite">
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={canExpand ? open : undefined}
        className="group inline-flex max-w-full items-center gap-2.5 text-left text-[15px] text-muted-foreground transition-colors enabled:hover:text-foreground"
      >
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span key={label} className="truncate animate-in fade-in duration-300">
          {label}
        </span>
        {seconds !== null && <span className="shrink-0 tabular-nums">{seconds}s</span>}
        {canExpand && (
          <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-90")} />
        )}
      </button>
      {open && (
        <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <StepList steps={steps} />
        </div>
      )}
    </div>
  );
}
