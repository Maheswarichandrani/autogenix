"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Image as ImageIcon, Paperclip, Plus, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Shown under the composer. */
const PRODUCT_LABEL = "Autogenix 2.0";
const DISCLAIMER = "Autogenix is AI and can make mistakes. Please double-check responses.";
const MAX_HEIGHT = 200;

/** Reads (once) the prompt typed on the Home page for a brand-new project. */
function useInitialPrompt(projectId: string, apply: (text: string) => void) {
  useEffect(() => {
    const key = `project-${projectId}-initial-prompt`;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return;
      localStorage.removeItem(key);
      const { prompt, timestamp } = JSON.parse(stored);
      if (prompt && Date.now() - timestamp < 5 * 60 * 1000) apply(prompt);
    } catch {
      /* storage blocked or malformed: start empty */
    }
  }, [projectId, apply]);
}

function ComingSoon({ icon: Icon, label }: { icon: typeof Paperclip; label: string }) {
  return (
    <DropdownMenuItem disabled className="gap-2">
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-muted-foreground">Coming soon</span>
    </DropdownMenuItem>
  );
}

/** Message box: + menu, auto-growing text, send / stop. */
export function Composer({
  projectId,
  isBusy,
  onSend,
}: {
  projectId: string;
  isBusy: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useInitialPrompt(projectId, useCallback((text: string) => setValue(text), []));

  // Grow with the text up to MAX_HEIGHT, then scroll
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    // Scroll only once past the cap; below it the box simply grows
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const canSend = value.trim().length > 0 && !isBusy;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex items-end gap-1.5 rounded-2xl border border-border bg-secondary px-2 py-2 shadow-sm transition-[border-color,box-shadow] duration-200",
          "focus-within:border-ring/50 focus-within:shadow-md",
        )}
      >
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Add files"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <Plus className="size-5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Add files</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <ComingSoon icon={Paperclip} label="Attach files" />
            <ComingSoon icon={ImageIcon} label="Add image" />
          </DropdownMenuContent>
        </DropdownMenu>

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message..."
          aria-label="Message"
          className="scrollbar-hide max-h-50 min-h-9 flex-1 resize-none overflow-y-hidden bg-transparent py-1.75 text-[16px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-[17px]"
        />

        {isBusy ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span: disabled buttons don't show tooltips */}
              <span tabIndex={0} className="flex size-9 shrink-0 items-center justify-center rounded-lg">
                <span className="flex size-7 items-center justify-center rounded-md bg-foreground/90 text-background opacity-60">
                  <Square className="size-3 fill-current" />
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Stopping a running build isn&apos;t supported yet</TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              canSend
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "pointer-events-none scale-90 text-muted-foreground opacity-0",
            )}
          >
            <ArrowUp className="size-4.5" />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[12.5px] sm:px-5 sm:text-[13px]">
        <p className="min-w-0 truncate text-muted-foreground">{DISCLAIMER}</p>
        <p className="shrink-0 font-semibold text-foreground">{PRODUCT_LABEL}</p>
      </div>
    </div>
  );
}
