"use client";

import React from "react";
import type { Message } from "@/types/workflow";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface UserMessageProps {
  message: Message;
}

export function UserMessage({ message }: UserMessageProps) {
  // Extract text content
  const textContent = message.content
    .filter((c) => c.type === "text")
    .map((c) => c.content)
    .join(" ");

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

  if (!textContent) return null;

  return (
    <div className="py-2 flex flex-col items-end max-w-[75%] ml-auto">
      {/* User Avatar and Label at the top */}
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs font-medium text-muted-foreground">You</div>
        <Avatar className="size-6 shrink-0">
          <AvatarFallback className="bg-muted">
            <User className="size-3" />
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Message Content */}
      <div
        className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 cursor-default"
        title={formatTime(message.created_at)}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
          {textContent}
        </p>
      </div>
    </div>
  );
}
