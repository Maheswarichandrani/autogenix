"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { stripAgentMarkers } from "@/lib/agent-markers";
import { useTypewriter } from "@/hooks/use-typewriter";
import { REPLY_TEXT_CLASS, replyMarkdownComponents } from "./markdown-components";

/** A finished agent reply. */
export const ReplyMarkdown = memo(function ReplyMarkdown({ content }: { content: string }) {
  return (
    <div className={REPLY_TEXT_CLASS}>
      <ReactMarkdown components={replyMarkdownComponents}>{stripAgentMarkers(content)}</ReactMarkdown>
    </div>
  );
});

/**
 * A reply that is still streaming. Plain text revealed by the typewriter while
 * chunks arrive (cheap per frame), full markdown once the stream ends.
 */
export const StreamingReplyMarkdown = memo(function StreamingReplyMarkdown({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const visible = stripAgentMarkers(content);
  const displayed = useTypewriter(visible, isStreaming, 3);

  if (isStreaming) {
    return (
      <div className={`${REPLY_TEXT_CLASS} whitespace-pre-wrap`}>
        {displayed}
        <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-foreground/70 align-middle" />
      </div>
    );
  }
  return <ReplyMarkdown content={visible} />;
});
