"use client";

import { Check, ChevronDown, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopy } from "@/hooks/use-copy";
import { fileName } from "@/lib/code-files";
import { cn } from "@/lib/utils";

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Copy ▾" split button: copies the file; the menu downloads it. */
export function CopyMenu({ path, content }: { path: string | null; content: string }) {
  const { copied, copy } = useCopy();
  const disabled = !path;

  const segment =
    "inline-flex h-8 items-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-border bg-secondary text-foreground">
      <button
        type="button"
        disabled={disabled}
        onClick={() => copy(content)}
        className={cn(segment, "gap-1.5 px-3 text-sm font-medium")}
        aria-live="polite"
      >
        {copied && <Check className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="h-5 w-px bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={disabled} className={cn(segment, "px-1.5")} aria-label="More copy options">
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => path && downloadText(fileName(path), content)}>
            <Download className="size-4" />
            Download file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
