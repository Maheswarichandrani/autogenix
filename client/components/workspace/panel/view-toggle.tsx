"use client";

import { Code2, Eye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CodePanelView } from "@/store/right-sidebar-store";
import { cn } from "@/lib/utils";

const OPTIONS: { value: CodePanelView; label: string; Icon: typeof Eye }[] = [
  { value: "preview", label: "Preview", Icon: Eye },
  { value: "code", label: "Code", Icon: Code2 },
];

/** Eye / code segmented control in the code panel header. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: CodePanelView;
  onChange: (view: CodePanelView) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Panel view" className="flex shrink-0 items-center gap-0.5">
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const selected = v === value;
        return (
          <Tooltip key={v}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                onClick={() => onChange(v)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg border transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  selected
                    ? "border-border bg-secondary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
