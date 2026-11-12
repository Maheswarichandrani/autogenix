"use client";

import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Round ↓ button that floats above the composer while the reader has scrolled up. */
export function ScrollToBottom({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Scroll to latest"
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      className={cn(
        "absolute -top-12 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full",
        "border border-border bg-background text-foreground shadow-md transition-all duration-200",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowDown className="size-4.5" />
    </button>
  );
}
