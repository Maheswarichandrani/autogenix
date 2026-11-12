"use client";

import { useState } from "react";
import { Check, GitBranch, Globe, Share } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Copied = "live" | "repo" | null;

/** Share: copy the live URL or repository link once the project is deployed. */
export function ShareMenu({ deployUrl, repoUrl }: { deployUrl?: string | null; repoUrl?: string | null }) {
  const [copied, setCopied] = useState<Copied>(null);

  const copy = async (which: Exclude<Copied, null>, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked: nothing to show */
    }
  };

  const item = (which: Exclude<Copied, null>, label: string, url: string | null | undefined, Icon: typeof Globe) => (
    <DropdownMenuItem
      disabled={!url}
      onSelect={(e) => {
        e.preventDefault(); // keep the menu open so the ✓ is visible
        if (url) copy(which, url);
      }}
    >
      {copied === which ? <Check className="size-4" /> : <Icon className="size-4" />}
      <span className="flex-1">{copied === which ? "Copied" : label}</span>
      {!url && <span className="text-[10px] text-muted-foreground">Available after deploy</span>}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-[15px] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Share className="size-4.5" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {item("live", "Copy live URL", deployUrl, Globe)}
        {item("repo", "Copy repository link", repoUrl, GitBranch)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
