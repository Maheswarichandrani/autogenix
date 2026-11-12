"use client";

import { ChevronDown, GitBranch, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Project name with its menu: settings and repository. Switching projects
 * happens in the sidebar only, so there is one place to do it.
 */
export function ProjectMenu({
  projectName,
  repoUrl,
  onOpenSettings,
}: {
  projectId: string;
  projectName: string;
  repoUrl?: string | null;
  onOpenSettings: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[15px] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="truncate">{projectName}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings className="size-4" />
          Project Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!repoUrl}
          onSelect={() => {
            if (repoUrl) window.open(repoUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <GitBranch className="size-4" />
          <span className="flex-1">View Repository</span>
          {!repoUrl && <span className="text-[10px] text-muted-foreground">Available after deploy</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
