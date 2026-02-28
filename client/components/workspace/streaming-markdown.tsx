"use client";

import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTypewriter } from "@/hooks/use-typewriter";

interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Optimized markdown component for streaming text.
 *
 * STREAMING FIX:
 *   Uses the useTypewriter hook to progressively reveal text at a natural
 *   reading pace. The store accumulates chunks instantly (flushSync), but
 *   this component reveals characters frame-by-frame using rAF — giving
 *   the true word-by-word typewriter effect.
 *
 *   During active streaming: simple text rendering (no markdown parsing)
 *   for maximum animation performance.
 *
 *   When streaming ends: switches to full ReactMarkdown for rich formatting.
 *   This matches ChatGPT/Copilot behaviour: raw text streams in, then
 *   gets formatted when the response is complete.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  isStreaming = false
}: StreamingMarkdownProps) {
  // Progressive text reveal — the core streaming fix.
  // charsPerFrame=3 ≈ 180 chars/sec at 60fps — natural reading speed.
  const displayedText = useTypewriter(content, isStreaming, 3);

  // During active streaming: simple text for smooth 60fps animation.
  // No markdown parsing overhead — just raw text with a blinking cursor.
  if (isStreaming) {
    return (
      <div className="text-sm leading-snug whitespace-pre-wrap text-foreground">
        {displayedText}
      </div>
    );
  }

  // Completed content: full markdown rendering with syntax highlighting
  return (
    <div className="prose prose-xs dark:prose-invert max-w-none *:my-1 *:first:mt-0 *:last:mb-0">
      <ReactMarkdown
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const codeContent = String(children).replace(/\n$/, "");

            return !inline && match ? (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                className="rounded-md my-1 text-xs!"
                {...props}
              >
                {codeContent}
              </SyntaxHighlighter>
            ) : (
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          p({ children }: any) {
            return <p className="leading-snug mb-1 last:mb-0 text-sm">{children}</p>;
          },
          ul({ children }: any) {
            return <ul className="list-disc list-inside space-y-0.5 my-1 text-sm">{children}</ul>;
          },
          ol({ children }: any) {
            return <ol className="list-decimal list-inside space-y-0.5 my-1 text-sm">{children}</ol>;
          },
          a({ href, children }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                {children}
              </a>
            );
          },
          h1({ children }: any) {
            return <h1 className="text-base font-semibold mt-2 mb-1">{children}</h1>;
          },
          h2({ children }: any) {
            return <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>;
          },
          h3({ children }: any) {
            return <h3 className="text-sm font-medium mt-1 mb-0.5">{children}</h3>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
