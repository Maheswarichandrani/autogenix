"use client";

/**
 * workspace-chat.tsx
 */

import React, { useEffect, useRef } from "react";
import { WorkspacePromptInput } from "./workspace-prompt-input";
import { ChatMessageItem } from "./chat-message-item";
import { StreamingMessage } from "./streaming-message";
import { Bot, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Message, UserAction, WorkflowStage } from "@/types/workflow";
import type { InProgressMessage } from "@/store/workflow-store";
import type { StepFeedItem } from "@/types/workflow";

interface WorkspaceChatProps {
  projectId:               string;
  messages:                Message[];
  stage:                   WorkflowStage;
  inProgressMessage:       InProgressMessage | null;
  active_role:             string | null;
  is_streaming:            boolean;
  isThinking:              boolean;
  thinkingStatus:          string | null;
  stepFeed:                StepFeedItem[];
  error:                   string | null;
  isLoadingHistory:        boolean;
  isHistoryError:          boolean;
  isSending:               boolean;
  isPendingWorkflowStart?: boolean;
  sendAction:              (action: UserAction) => void;
}

const WorkspaceChat = ({
  projectId,
  messages,
  stage,
  inProgressMessage,
  is_streaming,
  isThinking,
  thinkingStatus,
  stepFeed,
  error,
  isLoadingHistory,
  isSending,
  isPendingWorkflowStart = false,
  sendAction,
}: WorkspaceChatProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, inProgressMessage?.text, isThinking, isPendingWorkflowStart, stepFeed.length]);

  const handleSubmit = (content: string) => {
    if (!content.trim()) return;
    sendAction({ action: "send_message", content: content.trim() });
  };

  const isEmpty =
    !isLoadingHistory &&
    messages.length === 0 &&
    !inProgressMessage &&
    !isThinking &&
    !isPendingWorkflowStart &&
    stepFeed.length === 0;

  const isBusy = isSending || is_streaming || isThinking || isPendingWorkflowStart ||
    ["building", "testing", "fixing", "deploying"].includes(stage);

  return (
    <aside className="w-full h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-4">
        <div className="max-w-3xl mx-auto py-4 space-y-2">

          {isLoadingHistory && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Committed history */}
          {messages.map((message) => (
            <ChatMessageItem key={message.id} message={message} />
          ))}

          {/* Interim loading state - between message sent and workflow start */}
          {isPendingWorkflowStart && !inProgressMessage && !isThinking && (
            <div className="flex items-center gap-3 py-4 px-4 text-sm">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="size-4 text-primary" />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin shrink-0" />
                <span className="animate-pulse">Preparing your request...</span>
              </div>
            </div>
          )}

          {/* Live in-progress message with step feed */}
          {inProgressMessage ? (
            <StreamingMessage
              inProgressMessage={inProgressMessage}
              isStreaming={is_streaming}
              isThinking={isThinking}
              thinkingStatus={thinkingStatus}
              stepFeed={stepFeed}
            />
          ) : isThinking && thinkingStatus ? (
            /* Thinking before agent_start — minimal indicator */
            <div className="flex items-center gap-2 py-3 px-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin shrink-0" />
              <span className="animate-pulse">{thinkingStatus}</span>
            </div>
          ) : null}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="size-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Start Building with NexusAI</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Describe what you want to build and the AI agents will handle
                everything — from coding to testing to deployment.
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 p-3 sm:p-4 bg-card/10">
        <div className="max-w-3xl mx-auto">
          <WorkspacePromptInput
            projectId={projectId}
            onSubmit={handleSubmit}
            isProcessing={isBusy}
            placeholder={
              isBusy
                ? "Build in progress — please wait..."
                : "Ask NexusAI to build, modify, or explain..."
            }
          />
        </div>
      </div>
    </aside>
  );
};

export default WorkspaceChat;