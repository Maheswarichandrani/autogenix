"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, GitBranch, LayoutDashboard, Settings, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { projectsAPI } from "@/lib/api/projects";

const SWITCH_PROJECT_LIMIT = 8;

/** Project name with its menu: settings, repository, switch project. */
export function ProjectMenu({
  projectId,
  projectName,
  repoUrl,
  onOpenSettings,
}: {
  projectId: string;
  projectName: string;
  repoUrl?: string | null;
  onOpenSettings: () => void;
}) {
  const router = useRouter();
  const [switchOpen, setSwitchOpen] = useState(false);

  // Fetched only once the Switch Project submenu is opened.
  const otherProjects = useQuery({
    queryKey: ["projects", "switcher"],
    queryFn: async () => {
      const res = await projectsAPI.list({ page: 1, limit: SWITCH_PROJECT_LIMIT + 1 });
      if (res.error || !res.data) throw new Error(res.error ?? "Couldn't load projects");
      return res.data.projects;
    },
    enabled: switchOpen,
    staleTime: 30_000,
  });
  const switchable = (otherProjects.data ?? [])
    .filter((p) => p.id !== projectId)
    .slice(0, SWITCH_PROJECT_LIMIT);

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
        <DropdownMenuSeparator />
        <DropdownMenuSub open={switchOpen} onOpenChange={setSwitchOpen}>
          <DropdownMenuSubTrigger>Switch Project</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-2rem)]">
            {otherProjects.isLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : otherProjects.isError ? (
              <DropdownMenuItem disabled>Couldn&apos;t load projects</DropdownMenuItem>
            ) : switchable.length === 0 ? (
              <DropdownMenuItem disabled>No other projects</DropdownMenuItem>
            ) : (
              switchable.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => router.push(`/project/${p.id}`)}>
                  <span className="truncate">{p.name}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/home/projects")}>
              <LayoutDashboard className="size-4" />
              All projects
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/home")}>
              <Sparkles className="size-4" />
              New project
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
