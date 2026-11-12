"use client";

import { useRef } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { Message, StepFeedItem, UserAction } from "@/types/workflow";
import type { InProgressMessage } from "@/store/workflow-store";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { useWorkflowStore } from "@/store/workflow-store";
import { ChatThread } from "./chat/chat-thread";
import { LiveReply } from "./chat/live-reply";
import { PausedNotice } from "./chat/paused-notice";
import { ScrollToBottom } from "./chat/scroll-to-bottom";
import { Composer } from "./chat/composer";

interface WorkspaceChatProps {
  projectId: string;
  messages: Message[];
  inProgressMessage: InProgressMessage | null;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStatus: string | null;
  stepFeed: StepFeedItem[];
  error: string | null;
  isLoadingHistory: boolean;
  isPendingWorkflowStart: boolean;
  isBusy: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  pausedRole: string | null;
  pausedIteration: number;
  pausedMaxIterations: number;
  sendAction: (action: UserAction) => void;
}

/** Centred conversation column with the composer pinned underneath. */
export function WorkspaceChat({
  projectId,
  messages,
  inProgressMessage,
  isStreaming,
  isThinking,
  thinkingStatus,
  stepFeed,
  error,
  isLoadingHistory,
  isPendingWorkflowStart,
  isBusy,
  isPaused,
  pauseReason,
  pausedRole,
  pausedIteration,
  pausedMaxIterations,
  sendAction,
}: WorkspaceChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveFiles = useWorkflowStore((s) => s.liveFiles);
  const showLive = !!inProgressMessage || isThinking || isPendingWorkflowStart;

  // Anything that grows the conversation re-pins the view (if already at the bottom)
  const contentKey = `${messages.length}|${inProgressMessage?.text.length ?? 0}|${stepFeed.length}|${liveFiles.length}|${showLive}|${isPaused}`;
  const { isAtBottom, scrollToBottom } = useStickToBottom(scrollRef, contentKey);

  const send = (content: string) => sendAction({ action: "send_message", content });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-240 flex-col gap-8 px-4 pt-8 pb-10 sm:px-8 sm:pt-12">
          {isLoadingHistory && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <ChatThread messages={messages} isBusy={isBusy} onRetry={send} />

          {showLive && (
            <LiveReply
              message={inProgressMessage}
              isStreaming={isStreaming}
              thinkingStatus={thinkingStatus ?? (inProgressMessage ? null : "Preparing your request")}
              stepFeed={stepFeed}
              liveFiles={liveFiles}
            />
          )}

          {isPaused && (
            <PausedNotice
              role={pausedRole}
              iteration={pausedIteration}
              maxIterations={pausedMaxIterations}
              reason={pauseReason}
              sendAction={sendAction}
            />
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-4">
        <div className="relative mx-auto w-full max-w-240">
          <ScrollToBottom visible={!isAtBottom} onClick={scrollToBottom} />
          <Composer projectId={projectId} isBusy={isBusy} onSend={send} />
        </div>
      </div>
    </div>
  );
}

export default WorkspaceChat;
