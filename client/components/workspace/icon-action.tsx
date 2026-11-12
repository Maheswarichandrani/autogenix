"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconActionProps = ComponentPropsWithoutRef<"button"> & {
  /** Tooltip text; also the accessible name */
  label: string;
  /** Pressed state for toggles (thumbs, read aloud) */
  active?: boolean;
  size?: "sm" | "md";
  tooltipSide?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
};

/** Small ghost icon button with a tooltip. The one icon control used across the workspace. */
export const IconAction = forwardRef<HTMLButtonElement, IconActionProps>(function IconAction(
  { label, active = false, size = "md", tooltipSide = "bottom", className, children, ...props },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-pressed={props["aria-pressed"] ?? (active || undefined)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
            "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            "disabled:pointer-events-none disabled:opacity-40",
            "[&_svg]:shrink-0",
            size === "sm" ? "size-7 [&_svg]:size-3.75" : "size-8 [&_svg]:size-4.5",
            active && "text-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
});
