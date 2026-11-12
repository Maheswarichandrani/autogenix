"use client";

import { useEffect, useMemo } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { MonacoEditorWrapper } from "@/components/code-editor/monaco-editor-wrapper";
import { getLanguageFromFileName } from "@/components/code-editor/types";
import { useCodeStreamStore } from "@/store/code-stream-store";
import { useRightSidebar } from "@/store/right-sidebar-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { pickMainFile } from "@/lib/code-files";
import { IconAction } from "../icon-action";
import { PanelHeader } from "./panel-header";
import { ViewToggle } from "./view-toggle";
import { FileSwitcher } from "./file-switcher";
import { CopyMenu } from "./copy-menu";
import { CodePreview } from "./code-preview";

/** Right-hand code view: one file at a time, or the running app's API docs. */
export function CodePanel({ deployUrl }: { deployUrl?: string | null }) {
  const fileMap = useCodeStreamStore((s) => s.fileMap);
  const appUrl = useWorkflowStore((s) => s.appUrl);
  const { codePath, codeView, expanded, setCodePath, setCodeView, toggleExpanded, hide } = useRightSidebar();

  const paths = useMemo(() => Array.from(fileMap.keys()), [fileMap]);
  const current = codePath && fileMap.has(codePath) ? codePath : pickMainFile(paths);
  const content = current ? fileMap.get(current)?.content ?? "" : "";

  // Remember the resolved file so the card and switcher agree on it
  useEffect(() => {
    if (current && current !== codePath) setCodePath(current);
  }, [current, codePath, setCodePath]);

  return (
    <section aria-label="Code" className="flex h-full min-w-0 flex-col bg-background">
      <PanelHeader
        actions={
          <>
            {codeView === "code" && <CopyMenu path={current} content={content} />}
            <IconAction
              label={expanded ? "Exit full width" : "Full width"}
              onClick={toggleExpanded}
              className="hidden md:inline-flex"
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </IconAction>
            <IconAction label="Close" onClick={hide}>
              <X />
            </IconAction>
          </>
        }
      >
        <ViewToggle value={codeView} onChange={setCodeView} />
        <FileSwitcher paths={paths} current={current} onSelect={setCodePath} />
      </PanelHeader>

      <div className="relative min-h-0 flex-1">
        {codeView === "preview" ? (
          <CodePreview baseUrl={deployUrl || appUrl} />
        ) : current ? (
          <MonacoEditorWrapper
            content={content}
            language={getLanguageFromFileName(current)}
            fileName={current}
            readOnly
            minimap={false}
            showFileName={false}
            autoFocus={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Files appear here as the agents write them.
          </div>
        )}
      </div>
    </section>
  );
}
