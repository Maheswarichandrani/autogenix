"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { IconAction } from "./icon-action";
import { ProjectMenu } from "./header/project-menu";
import { ShareMenu } from "./header/share-menu";

interface WorkspaceHeaderProps {
  projectId: string;
  projectName: string;
  repoUrl?: string | null;
  deployUrl?: string | null;
  onOpenSettings: () => void;
  /** Opens the code panel; undefined while the project has no files */
  onOpenCode?: () => void;
  /** Hidden while the code panel is open (the panel has its own header) */
  showShare?: boolean;
}

/** Workspace top bar: sidebar toggle, project menu, share. */
export function WorkspaceHeader({
  projectId,
  projectName,
  repoUrl,
  deployUrl,
  onOpenSettings,
  onOpenCode,
  showShare = true,
}: WorkspaceHeaderProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-2 border-b border-border px-2.5 sm:px-3">
      <div className="flex min-w-0 items-center gap-1">
        <IconAction label="Toggle sidebar" onClick={toggleSidebar}>
          <PanelLeft />
        </IconAction>
        <ProjectMenu
          projectId={projectId}
          projectName={projectName}
          repoUrl={repoUrl}
          onOpenSettings={onOpenSettings}
        />
      </div>
      {showShare && (
        <div className="flex shrink-0 items-center gap-1">
          <IconAction label={onOpenCode ? "Code" : "No files yet"} onClick={onOpenCode} disabled={!onOpenCode}>
            <PanelRight />
          </IconAction>
          <ShareMenu deployUrl={deployUrl} repoUrl={repoUrl} />
        </div>
      )}
    </header>
  );
}
