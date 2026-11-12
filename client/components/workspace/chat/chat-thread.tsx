"use client";

import { Fragment, useMemo } from "react";
import type { Message } from "@/types/workflow";
import { AgentReply } from "./agent-reply";
import { MessageActions } from "./message-actions";
import { UserBubble, messageText } from "./user-bubble";

interface Turn {
  user: Message | null;
  replies: Message[];
}

/** Each user message plus the agent replies that answered it. */
function groupTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") turns.push({ user: m, replies: [] });
    else if (turns.length === 0) turns.push({ user: null, replies: [m] });
    else turns[turns.length - 1].replies.push(m);
  }
  return turns;
}

/** Committed conversation history. */
export function ChatThread({
  messages,
  isBusy,
  onRetry,
}: {
  messages: Message[];
  /** A build is running: the latest turn is not finished yet */
  isBusy: boolean;
  onRetry: (text: string) => void;
}) {
  const turns = useMemo(() => groupTurns(messages), [messages]);

  return (
    <>
      {turns.map((turn, t) => {
        const isLatest = t === turns.length - 1;
        const agentReplies = turn.replies.filter((m) => m.role !== "system");
        const lastReply = agentReplies[agentReplies.length - 1];
        const showActions = !!lastReply && !(isLatest && isBusy);
        const userText = turn.user ? messageText(turn.user) : "";

        return (
          <Fragment key={turn.user?.id ?? `turn-${t}`}>
            {turn.user && <UserBubble message={turn.user} />}

            {turn.replies.map((m) => {
              if (m.role === "system") {
                const text = m.content[0]?.type === "text" ? m.content[0].content : "";
                return text ? (
                  <p key={m.id} className="text-center text-xs text-muted-foreground">
                    {text}
                  </p>
                ) : null;
              }
              const isLast = m.id === lastReply?.id;
              return (
                <AgentReply
                  key={m.id}
                  message={m}
                  footer={
                    <>
                      {isLast && showActions && (
                        <MessageActions
                          messageId={m.id}
                          text={agentReplies.map(messageText).join("\n\n")}
                          onRetry={isLatest && userText ? () => onRetry(userText) : undefined}
                          retryDisabled={isBusy}
                        />
                      )}
                    </>
                  }
                />
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
