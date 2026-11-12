"use client";

import { memo, useMemo, type ReactNode } from "react";
import type { Message } from "@/types/workflow";
import { ArtifactCard } from "../artifact-card";
import { ReplyMarkdown } from "./reply-markdown";
import { StepSummary } from "./step-summary";
import { FileCards } from "./file-cards";
import { savedStepsToView } from "./steps";

/** A finished agent message: step summary, reply text, cards. No avatar or bubble. */
export const AgentReply = memo(function AgentReply({
  message,
  footer,
}: {
  message: Message;
  /** Action row rendered under this reply */
  footer?: ReactNode;
}) {
  const saved = message.metadata?.steps;
  const steps = useMemo(() => savedStepsToView(saved, message.id), [saved, message.id]);
  const tools = useMemo(() => (saved ?? []).map((s) => s.tool), [saved]);

  return (
    <div className="animate-in fade-in duration-300">
      <StepSummary steps={steps} tools={tools} />
      <div className="space-y-3">
        {message.content.map((block, i) => {
          if (block.type === "text") return <ReplyMarkdown key={i} content={block.content} />;
          if (block.type === "artifact" && block.artifact_data) {
            return (
              <ArtifactCard
                key={i}
                artifactType={block.artifact_data.artifact_type}
                title={block.artifact_data.title}
                content={block.artifact_data.content}
              />
            );
          }
          return null;
        })}
      </div>
      <FileCards paths={message.metadata?.files ?? []} />
      {footer}
    </div>
  );
});
