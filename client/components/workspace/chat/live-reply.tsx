"use client";

import { memo, useMemo } from "react";
import type { InProgressMessage } from "@/store/workflow-store";
import type { StepFeedItem } from "@/types/workflow";
import { ArtifactCard } from "../artifact-card";
import { LiveStatus } from "./live-status";
import { StepSummary } from "./step-summary";
import { FileCards } from "./file-cards";
import { StreamingReplyMarkdown } from "./reply-markdown";
import { liveStepsToView } from "./steps";

/**
 * The agent reply being built right now. Before any text: one live status
 * line. Once text streams: the step summary, then the text.
 */
export const LiveReply = memo(function LiveReply({
  message,
  isStreaming,
  thinkingStatus,
  stepFeed,
  liveFiles,
}: {
  message: InProgressMessage | null;
  isStreaming: boolean;
  thinkingStatus: string | null;
  stepFeed: StepFeedItem[];
  /** Files this agent has written so far */
  liveFiles: string[];
}) {
  const steps = useMemo(() => liveStepsToView(stepFeed), [stepFeed]);
  const tools = useMemo(() => stepFeed.map((s) => s.tool), [stepFeed]);
  const text = message?.text ?? "";
  const artifact = message?.artifact ?? null;

  if (!text.trim() && !artifact) {
    const current = [...stepFeed].reverse().find((s) => s.state === "pending") ?? stepFeed[stepFeed.length - 1];
    const label = thinkingStatus ?? current?.status ?? "Thinking";
    return (
      <div>
        <LiveStatus label={label} since={current?.startedAt} steps={steps} />
        <FileCards paths={liveFiles} />
      </div>
    );
  }

  return (
    <div>
      <StepSummary steps={steps} tools={tools} />
      <div className="space-y-3">
        {text.trim() && <StreamingReplyMarkdown content={text} isStreaming={isStreaming} />}
        {artifact && (
          <ArtifactCard artifactType={artifact.artifact_type} title={artifact.title} content={artifact.content} />
        )}
      </div>
      <FileCards paths={liveFiles} />
    </div>
  );
});
