"use client";

/**
 * streaming-message.tsx
 *
 * Renders the inProgressMessage while it's being assembled from SSE chunks.
 *
 * STATE MACHINE:
 *   1. agent_start fired, no chunks yet, no steps
 *      → bouncing dots (waiting for first action)
 *   2. step/tool_call/tool_result arriving (stepFeed has items)
 *      → StepFeed timeline (Copilot-style, each step appends)
 *   3. thinking event (isThinking=true, thinkingStatus set)
 *      → pulsing single-line status "Reasoning..."
 *   4. text_chunk arriving (is_streaming=true)
 *      → text content + blinking cursor (step feed clears)
 *   5. artifact received
 *      → ArtifactCard
 *   6. agent_done → parent removes this component, ChatMessageItem takes over
 *
 * THE STREAMING FIX:
 *   text_chunk events go directly to inProgressMessage.text in Zustand via
 *   set() — React re-renders on every chunk immediately. No batching. The
 *   "all text appears at once" bug was caused by TQ caching; now that Zustand
 *   is the single source of truth, each chunk renders as it arrives.
 */

import React, { memo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Loader2 } from "lucide-react";
import { StreamingMarkdown } from "./streaming-markdown";
import { ArtifactCard } from "./artifact-card";
import type { InProgressMessage } from "@/store/workflow-store";
import type { StepFeedItem } from "@/types/workflow";
import { StepFeed } from "../step-feed";

interface StreamingMessageProps {
  inProgressMessage: InProgressMessage;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStatus: string | null;
  stepFeed: StepFeedItem[];
}

export const StreamingMessage = memo(function StreamingMessage({
  inProgressMessage,
  isStreaming,
  isThinking,
  thinkingStatus,
  stepFeed,
}: StreamingMessageProps) {
  const { role, text, artifact } = inProgressMessage;
  const hasText = text.trim().length > 0;
  const hasArtifact = artifact !== null;
  const hasContent = hasText || hasArtifact;
  const hasSteps = stepFeed.length > 0;
  const isActive = isStreaming || isThinking || hasSteps;

  return (
    <div className="py-2 animate-in fade-in duration-200">
      {/* Agent label + activity indicator */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="size-6 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Bot className="size-3" />
          </AvatarFallback>
        </Avatar>

        <span className="text-xs font-medium text-muted-foreground capitalize">
          {role}
        </span>

        {isActive && (
          <Loader2 className="size-3 animate-spin text-primary/60" />
        )}

        {isStreaming && (
          <span className="size-2 rounded-full bg-primary animate-pulse" />
        )}
      </div>

      <div className="space-y-2">
        {/* ── Step feed (tool execution timeline) ─────────────────── */}
        {/* Shown while agent is using tools. Clears when text starts. */}
        {hasSteps && !hasContent && (
          <div className="px-1 py-1 bg-muted/30 rounded-xl border border-border/40">
            <StepFeed
              steps={stepFeed}
              role={role}
            />
          </div>
        )}

        {/* ── Thinking status (pulsing single-line, replaces itself) ── */}
        {!hasSteps && !hasContent && isThinking && thinkingStatus && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 rounded-2xl rounded-tl-sm w-fit text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin shrink-0" />
            <span>{thinkingStatus}</span>
          </div>
        )}

        {/* ── Fallback bouncing dots ───────────────────────────────── */}
        {!hasSteps && !hasContent && !isThinking && (
          <div className="flex items-center gap-1.5 px-4 py-3 bg-muted/50 rounded-2xl rounded-tl-sm w-fit">
            <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:120ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:240ms]" />
          </div>
        )}

        {/* ── Text content + artifact ──────────────────────────────── */}
        {/* Rendered once text_chunk events start flowing. */}
        {/* Each re-render appends the latest chunk to text — typewriter effect. */}
        {hasContent && (
          <div className="space-y-2 max-w-[95%]">
            {hasArtifact && artifact && (
              <ArtifactCard
                artifactType={artifact.artifact_type}
                title={artifact.title}
                content={artifact.content}
              />
            )}

            {hasText && (
              <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3">
                <StreamingMarkdown
                  content={text}
                  isStreaming={isStreaming}
                />
                {/* Blinking cursor — only while chunks actively arriving */}
                {isStreaming && (
                  <span className="inline-block w-0.5 h-[1em] bg-primary/80 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});