"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileName, languageLabel, sortPaths } from "@/lib/code-files";

/** "main.py · Python" title; with more than one file it opens a file list. */
export function FileSwitcher({
  paths,
  current,
  onSelect,
}: {
  paths: string[];
  current: string | null;
  onSelect: (path: string) => void;
}) {
  if (!current) {
    return <span className="truncate text-[15px] font-medium text-muted-foreground">No files yet</span>;
  }

  const title = (
    <span className="flex min-w-0 items-baseline gap-1.5 text-[15px]">
      <span className="truncate font-medium text-foreground">{fileName(current)}</span>
      <span className="shrink-0 text-muted-foreground">· {languageLabel(current)}</span>
    </span>
  );

  if (paths.length < 2) return <div className="min-w-0">{title}</div>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Switch file"
        >
          {title}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {sortPaths(paths).map((path) => (
          <DropdownMenuItem key={path} onSelect={() => onSelect(path)} className="gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
            {path === current && <Check className="size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
