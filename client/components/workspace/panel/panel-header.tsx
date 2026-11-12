import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Header bar shared by the right-hand panels. Same height as the workspace header. */
export function PanelHeader({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-13 shrink-0 items-center justify-between gap-2 border-b border-border px-2.5 sm:px-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
