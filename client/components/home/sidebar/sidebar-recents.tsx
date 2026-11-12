"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { projectsAPI } from "@/lib/api/projects";
import { cn } from "@/lib/utils";

const LIMIT = 30;
const OPEN_KEY = "autogenix-sidebar-recents-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/** The user's projects, newest first; the current one is highlighted. */
export function SidebarRecents() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : readOpen()));

  const recents = useQuery({
    queryKey: ["projects", "recents"],
    queryFn: async () => {
      const res = await projectsAPI.list({ page: 1, limit: LIMIT });
      if (res.error || !res.data) throw new Error(res.error ?? "Couldn't load projects");
      return res.data;
    },
    staleTime: 30_000,
  });

  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* storage blocked: session only */
      }
      return !v;
    });
  };

  const projects = recents.data?.projects ?? [];
  const hasMore = (recents.data?.total ?? 0) > projects.length;

  return (
    <SidebarGroup className="min-h-0 flex-1 group-data-[collapsible=icon]:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-8 w-fit items-center gap-1 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
      >
        Recents
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
      </button>

      {open && (
        <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto">
          {recents.isLoading ? (
            <div className="space-y-3 px-2 py-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${85 - i * 9}%` }} />
              ))}
            </div>
          ) : recents.isError ? (
            <div className="space-y-1 px-2 py-2 text-sm text-sidebar-foreground/70">
              <p>Couldn&apos;t load projects</p>
              <button type="button" onClick={() => recents.refetch()} className="text-sidebar-foreground underline-offset-2 hover:underline">
                Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <p className="px-2 py-2 text-sm text-sidebar-foreground/70">No projects yet</p>
          ) : (
            <SidebarMenu className="gap-0.5">
              {projects.map((p) => {
                const href = `/project/${p.id}`;
                const active = pathname === href;
                return (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-9 text-[15px] data-[active=true]:font-normal"
                    >
                      <Link href={href} onClick={() => isMobile && setOpenMobile(false)} title={p.name}>
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            active ? "bg-sidebar-foreground/70" : "bg-sidebar-foreground/25",
                          )}
                        />
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {hasMore && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="h-9 text-sm text-sidebar-foreground/70">
                    <Link href="/home/projects" onClick={() => isMobile && setOpenMobile(false)}>
                      <span>All projects</span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}
