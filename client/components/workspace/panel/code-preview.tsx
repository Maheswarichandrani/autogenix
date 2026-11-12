"use client";

import { ExternalLink, MonitorOff } from "lucide-react";

/**
 * The generated app's API docs. The URL is only ever the project's own deploy
 * URL or the sandbox URL the worker announced, never user input. The app is
 * untrusted, so the frame is sandboxed and sends no referrer.
 */
export function CodePreview({ baseUrl }: { baseUrl: string | null }) {
  if (!baseUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <MonitorOff className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="max-w-xs text-sm text-muted-foreground">
          The app isn&apos;t running. Preview appears while a build runs or after deploy.
        </p>
      </div>
    );
  }

  const docsUrl = `${baseUrl.replace(/\/+$/, "")}/docs`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3 text-xs text-muted-foreground">
        <span className="truncate font-mono">{docsUrl}</span>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 transition-colors hover:text-foreground"
        >
          Open in new tab
          <ExternalLink className="size-3.5" />
        </a>
      </div>
      <iframe
        key={docsUrl}
        src={docsUrl}
        title="App API docs"
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
        className="min-h-0 flex-1 bg-white"
      />
    </div>
  );
}
