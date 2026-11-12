"use client";

import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

/** Toggle + product name. Collapsed to icons, only the toggle shows. */
export function SidebarBrand() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="flex h-11 items-center gap-1.5 px-0.5">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <PanelLeft className="size-4.5" />
      </button>
      <Link
        href="/home"
        className="truncate text-[22px] font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden"
      >
        Autogenix
      </Link>
    </div>
  );
}
