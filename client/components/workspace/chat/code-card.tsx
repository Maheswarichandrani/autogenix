"use client";

import { Code2 } from "lucide-react";
import { useCodeStreamStore } from "@/store/code-stream-store";
import { useRightSidebar } from "@/store/right-sidebar-store";
import { pickMainFile } from "@/lib/code-files";

/** Card under the builder's reply that opens the generated code. */
export function CodeCard({ title }: { title: string }) {
  const fileMap = useCodeStreamStore((s) => s.fileMap);
  const showCode = useRightSidebar((s) => s.showCode);
  const setCodeView = useRightSidebar((s) => s.setCodeView);

  const count = fileMap.size;
  if (count === 0) return null;

  const open = () => {
    setCodeView("code");
    showCode(pickMainFile(Array.from(fileMap.keys())) ?? undefined);
  };

  return (
    <button
      type="button"
      onClick={open}
      className="group mt-4 flex w-full max-w-162.5 items-center gap-3.5 rounded-xl border border-border/60 bg-secondary/70 p-3 text-left transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:p-3.5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <Code2 className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-medium text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">
          Code · {count} {count === 1 ? "file" : "files"}
        </span>
      </span>
    </button>
  );
}
