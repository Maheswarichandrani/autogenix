"use client";

import React from "react";
import type { Message } from "@/types/workflow";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot } from "lucide-react";
import { MarkdownContent } from "./markdown-content";
import { ArtifactCard } from "./artifact-card";

interface AssistantMessageProps {
  message: Message;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  // Format time only (no date)
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="py-2">
      {/* AI Avatar and Label at the top */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="size-6 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Bot className="size-3" />
          </AvatarFallback>
        </Avatar>
        <div className="text-xs font-medium text-muted-foreground">
          NexusAI
        </div>
      </div>

      {/* Message Content */}
      <div className="space-y-2">
        {/* Render all content blocks */}
        {message.content.map((block, idx) => {
          if (block.type === "text") {
            return (
              <div
                key={idx}
                className="bg-muted/50 rounded-2xl rounded-tl-sm px-3 py-2 cursor-default"
                title={formatTime(message.created_at)}
              >
                <MarkdownContent content={block.content} />
              </div>
            );
          }

          if (block.type === "artifact" && block.artifact_data) {
            return (
              <ArtifactCard
                key={idx}
                artifactType={block.artifact_data.artifact_type}
                title={block.artifact_data.title}
                content={block.artifact_data.content}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
