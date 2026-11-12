"use client";

import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

/** Agent reply typography: serif body, sans-free mono for code. */
export const REPLY_TEXT_CLASS =
  "font-serif text-[16px] sm:text-[17px] leading-[1.6] text-foreground wrap-break-word";

/** Shared element styles for every agent reply (live and finished). */
export const replyMarkdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          className="my-3! rounded-lg! text-[13px]! font-mono"
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    }
    return (
      <code
        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  },
  p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1.5 pl-7">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-7">{children}</ol>,
  li: ({ children }) => <li className="pl-1.5 marker:text-foreground">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mt-5 mb-2 text-[1.15em] font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-[1.05em] font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 font-semibold first:mt-0">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse font-sans text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-3 py-2">{children}</td>,
};
