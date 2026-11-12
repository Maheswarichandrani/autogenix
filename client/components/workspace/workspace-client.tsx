"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/types/project";
import { useWorkflow } from "@/hooks/use-workflow";
import { useCodeStream } from "@/hooks/use-code-stream";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRightSidebar } from "@/store/right-sidebar-store";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceChat } from "./workspace-chat";
import { WorkspaceActionsProvider } from "./workspace-actions-context";
import { RightPanel } from "./panel/right-panel";
import { ResizeHandle } from "./panel/resize-handle";

const BUSY_STAGES = ["building", "thinking", "testing", "fixing", "deploying"];

/**
 * Workspace layout. The chat column is always mounted (scroll position and
 * the half-typed message survive the panel opening and closing). On desktop
 * the panel slides in beside it; on phones it covers the chat.
 */
const WorkspaceClient = ({ initialProject }: { initialProject: Project }) => {
  const wf = useWorkflow(initialProject.id);
  useCodeStream(initialProject.id);

  const isMobile = useIsMobile();
  const { isVisible: panelOpen, expanded, showSettings, hide } = useRightSidebar();

  // The panel store is global: start each project with it closed
  useEffect(() => {
    hide();
  }, [initialProject.id, hide]);
  const rowRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(50);
  const [dragging, setDragging] = useState(false);

  const isBusy =
    wf.isSending || wf.is_streaming || wf.isThinking || wf.isPendingWorkflowStart || BUSY_STAGES.includes(wf.stage);

  const deployUrl = initialProject.latest_deploy_url ?? null;
  const chatHidden = panelOpen && (expanded || isMobile);
  const desktopPanelWidth = !panelOpen ? 0 : expanded ? 100 : panelWidth;

  return (
    <WorkspaceActionsProvider value={{ projectId: initialProject.id, sendActionAsync: wf.sendActionAsync }}>
      <div ref={rowRef} className="relative flex h-full min-h-0 w-full overflow-hidden bg-background">
        {/* Chat column (header + conversation) */}
        <div
          className={cn("flex min-w-0 flex-1 flex-col", chatHidden && "invisible absolute inset-0")}
          aria-hidden={chatHidden || undefined}
        >
          <WorkspaceHeader
            projectId={initialProject.id}
            projectName={initialProject.name}
            repoUrl={initialProject.repo_url}
            deployUrl={deployUrl}
            onOpenSettings={showSettings}
            showShare={!panelOpen}
          />
          <div className="min-h-0 flex-1">
            <WorkspaceChat
              projectId={initialProject.id}
              messages={wf.messages}
              inProgressMessage={wf.inProgressMessage}
              isStreaming={wf.is_streaming}
              isThinking={wf.isThinking}
              thinkingStatus={wf.thinkingStatus}
              stepFeed={wf.stepFeed}
              error={wf.error}
              isLoadingHistory={wf.isLoadingHistory}
              isPendingWorkflowStart={wf.isPendingWorkflowStart}
              isBusy={isBusy}
              isPaused={wf.isPaused}
              pauseReason={wf.pauseReason}
              pausedRole={wf.pausedRole}
              pausedIteration={wf.pausedIteration}
              pausedMaxIterations={wf.pausedMaxIterations}
              sendAction={wf.sendAction}
            />
          </div>
        </div>

        {/* Right panel: code or settings */}
        {isMobile ? (
          panelOpen && (
            <div className="fixed inset-0 z-40 bg-background animate-in slide-in-from-right-8 fade-in duration-200">
              <RightPanel deployUrl={deployUrl} />
            </div>
          )
        ) : (
          <div
            className={cn(
              "relative shrink-0 overflow-hidden",
              !dragging && "transition-[width] duration-300 ease-out",
            )}
            style={{ width: `${desktopPanelWidth}%` }}
          >
            {panelOpen && (
              <>
                {!expanded && (
                  <ResizeHandle
                    containerRef={rowRef}
                    value={panelWidth}
                    onChange={setPanelWidth}
                    onDragChange={setDragging}
                  />
                )}
                <div className="h-full min-w-[320px] animate-in fade-in duration-300">
                  <RightPanel deployUrl={deployUrl} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </WorkspaceActionsProvider>
  );
};

export default WorkspaceClient;
