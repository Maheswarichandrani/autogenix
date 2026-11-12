"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Thin vertical divider between chat and panel. Dragging reports the panel's
 * new width as a percentage of `containerRef`; arrow keys nudge it by 5%.
 */
export function ResizeHandle({
  containerRef,
  value,
  onChange,
  onDragChange,
  min = 30,
  max = 70,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  value: number;
  onChange: (percent: number) => void;
  onDragChange?: (dragging: boolean) => void;
  min?: number;
  max?: number;
}) {
  const dragging = useRef(false);
  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const onPointerDown = (e: React.PointerEvent) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    onDragChange?.(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    onChange(clamp(((box.right - e.clientX) / box.width) * 100));
  };

  const stop = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    onDragChange?.(false);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clamp(value + 5));
        if (e.key === "ArrowRight") onChange(clamp(value - 5));
      }}
      className={cn(
        "group absolute inset-y-0 left-0 z-20 flex w-2 cursor-col-resize justify-start touch-none",
        "focus-visible:outline-none",
      )}
    >
      <span className="h-full w-px bg-border transition-colors duration-150 group-hover:bg-ring/60 group-focus-visible:bg-ring group-active:bg-ring" />
    </div>
  );
}
