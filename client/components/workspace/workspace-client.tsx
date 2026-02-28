"use client";

/**
 * workspace-client.tsx
 */

import { Project } from "@/types/project";
import { WorkspaceHeader } from "./workspace-header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import WorkspaceChat from "./workspace-chat";
import { useWorkflow } from "@/hooks/use-workflow";
import { useCodeStream } from "@/hooks/use-code-stream";
import RightSidebar from "./right-sidebar";
import { useRightSidebar } from "@/store/right-sidebar-store";

interface WorkspaceClientProps {
  initialProject: Project;
}

const WorkspaceClient = ({ initialProject }: WorkspaceClientProps) => {
  const {
    messages,
    stage,
    inProgressMessage,
    active_role,
    is_streaming,
    isThinking,
    thinkingStatus,
    stepFeed,
    error,
    isLoadingHistory,
    isHistoryError,
    isSending,
    isPendingWorkflowStart,
    sendAction,
  } = useWorkflow(initialProject.id);

  // Second SSE stream — code panel receives file events on a separate channel
  const { fileCount, isConnected: isCodeConnected } = useCodeStream(initialProject.id);

  const {
    showCode,
    showSettings,
    setIdle,
    hide
  } = useRightSidebar();

  const { currentState, isVisible } = useRightSidebar();

  const handleTabChange = (tab: string) => {
    switch (tab) {
      case "code":
        showCode();
        break;
      case "settings":
        showSettings();
        break;
      case "idle":
      default:
        setIdle();
        break;
    }
  };

  return (
    <>
      <WorkspaceHeader
        projectName={initialProject.name}
        isBuilding={["building", "thinking", "testing", "fixing"].includes(stage)}
        activeTab={currentState}
        onTabChange={handleTabChange}
        onDeploy={() => console.log("Deploy")}
        onShare={() => console.log("Share")}
      />

      <div style={{ height: "calc(100vh - 56px)" }}>
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel minSize={500} maxSize={800}>
            <WorkspaceChat
              projectId={initialProject.id}
              messages={messages}
              stage={stage}
              inProgressMessage={inProgressMessage}
              active_role={active_role}
              is_streaming={is_streaming}
              isThinking={isThinking}
              thinkingStatus={thinkingStatus}
              stepFeed={stepFeed}
              error={error}
              isLoadingHistory={isLoadingHistory}
              isHistoryError={isHistoryError}
              isSending={isSending}
              isPendingWorkflowStart={isPendingWorkflowStart}
              sendAction={sendAction}
            />
          </ResizablePanel>

          <ResizableHandle />
          <ResizablePanel className="w-full">
            <RightSidebar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
};

export default WorkspaceClient;