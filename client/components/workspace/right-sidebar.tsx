"use client";

import { useRightSidebar } from "@/store/right-sidebar-store";
// import { useCodeStore } from "@/store/code-store";
import { Code2, FileCode, FolderTree } from "lucide-react";
import WorkSpaceIdealState from "../workflow-ideal-state";
import { PreviewSidebar } from "./preview-sidebar";
import { SettingsSidebar } from "./settings-sidebar";

export const RightSidebar = () => {
  const { currentState, isVisible } = useRightSidebar();
  // const files = useCodeStore((s) => s.files);
  // const selectedFile = useCodeStore((s) => s.selectedFile);
  // const selectFile = useCodeStore((s) => s.selectFile);

  // const fileList = Array.from(files.values());
  // const selected = selectedFile ? files.get(selectedFile) : null;

  const renderContent = () => {
    if (!isVisible) {
      return <WorkSpaceIdealState/>;
    }

    switch (currentState) {
      case "code":
        return <PreviewSidebar />;

      case "settings":
        return <SettingsSidebar />;

      case "idle":
      default:
        return <WorkSpaceIdealState/>
    }
  };

  return (
    <div className="h-full">
      {renderContent()}
    </div>
  );
};

export default RightSidebar;
