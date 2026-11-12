"use client";

import { Pause, Play, RefreshCw, XCircle } from "lucide-react";
import type { UserAction } from "@/types/workflow";

/** Shown when an agent used its step budget and waits for the user. */
export function PausedNotice({
  role,
  iteration,
  maxIterations,
  reason,
  sendAction,
}: {
  role: string | null;
  iteration: number;
  maxIterations: number;
  reason: string | null;
  sendAction: (action: UserAction) => void;
}) {
  const button =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/60 p-4 animate-in fade-in duration-200">
      <div className="flex items-center gap-2 text-[15px] font-medium">
        <Pause className="size-4 shrink-0 text-muted-foreground" />
        <span>
          <span className="capitalize">{role ?? "Agent"}</span> paused after {iteration}/{maxIterations} steps
        </span>
      </div>
      {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => sendAction({ action: "agent_continue" })}
          className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          <Play className="size-3.5" />
          Continue
        </button>
        <button
          type="button"
          onClick={() => {
            const model = window.prompt("Model to continue with (for example claude-sonnet-5-5):");
            if (model?.trim()) sendAction({ action: "agent_switch_model", model: model.trim() });
          }}
          className={`${button} bg-background text-foreground hover:bg-accent`}
        >
          <RefreshCw className="size-3.5" />
          Switch model
        </button>
        <button
          type="button"
          onClick={() => sendAction({ action: "agent_cancel" })}
          className={`${button} text-destructive hover:bg-destructive/10`}
        >
          <XCircle className="size-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}
