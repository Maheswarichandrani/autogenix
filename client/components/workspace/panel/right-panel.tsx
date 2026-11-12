"use client";

import { X } from "lucide-react";
import { useRightSidebar } from "@/store/right-sidebar-store";
import { SettingsSidebar } from "../settings-sidebar";
import { IconAction } from "../icon-action";
import { PanelHeader } from "./panel-header";
import { CodePanel } from "./code-panel";

/** Whatever the right-hand panel is showing: code or project settings. */
export function RightPanel({ deployUrl }: { deployUrl?: string | null }) {
  const currentState = useRightSidebar((s) => s.currentState);
  const hide = useRightSidebar((s) => s.hide);

  if (currentState === "settings") {
    return (
      <section aria-label="Settings" className="flex h-full min-w-0 flex-col bg-background">
        <PanelHeader
          actions={
            <IconAction label="Close" onClick={hide}>
              <X />
            </IconAction>
          }
        >
          <span className="px-1 text-[15px] font-medium">Settings</span>
        </PanelHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SettingsSidebar />
        </div>
      </section>
    );
  }

  return <CodePanel deployUrl={deployUrl} />;
}
