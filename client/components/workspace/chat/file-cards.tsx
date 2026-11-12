"use client";

import { useState } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { useCodeStreamStore } from "@/store/code-stream-store";
import { useRightSidebar } from "@/store/right-sidebar-store";
import { fileName, languageLabel } from "@/lib/code-files";
import { cn } from "@/lib/utils";

const VISIBLE = 4;

function FileCard({ path, exists, onOpen }: { path: string; exists: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!exists}
      title={path}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-xl border border-border/60 bg-secondary/70 p-3 text-left transition-colors duration-150 sm:p-3.5",
        "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:cursor-default disabled:opacity-60 disabled:hover:bg-secondary/70",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-enabled:group-hover:text-foreground">
        <Code2 className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-medium text-foreground">{fileName(path)}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {exists ? `Code · ${languageLabel(path)}` : "Deleted"}
        </span>
      </span>
    </button>
  );
}

/** One card per file an agent wrote; clicking opens it in the code panel. */
export function FileCards({ paths }: { paths: string[] }) {
  const fileMap = useCodeStreamStore((s) => s.fileMap);
  const showCode = useRightSidebar((s) => s.showCode);
  const setCodeView = useRightSidebar((s) => s.setCodeView);
  const [expanded, setExpanded] = useState(false);

  if (paths.length === 0) return null;

  const shown = expanded ? paths : paths.slice(0, VISIBLE);
  const hidden = paths.length - shown.length;
  // Files still loading from the server count as present, so cards never flash "Deleted"
  const exists = (p: string) => fileMap.size === 0 || fileMap.has(p);

  const open = (path: string) => {
    setCodeView("code");
    showCode(path);
  };

  return (
    <div className="mt-4 flex max-w-162.5 flex-col gap-2">
      {shown.map((p) => (
        <FileCard key={p} path={p} exists={exists(p)} onOpen={() => open(p)} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Show {hidden} more {hidden === 1 ? "file" : "files"}
          <ChevronDown className="size-3.5" />
        </button>
      )}
    </div>
  );
}
