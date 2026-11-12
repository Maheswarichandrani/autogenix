"use client";

import { create } from "zustand";

/**
 * The workspace's right-hand panel: the code view or project settings.
 * Closed by default; the chat takes the full width until something opens it.
 */
export type RightSidebarState = "code" | "settings";

export type CodePanelView = "code" | "preview";

export interface RightSidebarStore {
  currentState: RightSidebarState;
  isVisible: boolean;
  /** Panel takes the full width and the chat is hidden */
  expanded: boolean;
  /** File shown in the code view (a path from the code stream store) */
  codePath: string | null;
  codeView: CodePanelView;

  showCode: (path?: string) => void;
  showSettings: () => void;
  hide: () => void;
  toggleExpanded: () => void;
  setCodePath: (path: string) => void;
  setCodeView: (view: CodePanelView) => void;
}

export const useRightSidebar = create<RightSidebarStore>()((set) => ({
  currentState: "code",
  isVisible: false,
  expanded: false,
  codePath: null,
  codeView: "code",

  showCode: (path) =>
    set((s) => ({
      currentState: "code",
      isVisible: true,
      codePath: path ?? s.codePath,
    })),

  showSettings: () => set({ currentState: "settings", isVisible: true }),

  hide: () => set({ isVisible: false, expanded: false }),

  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),

  setCodePath: (path) => set({ codePath: path }),

  setCodeView: (view) => set({ codeView: view }),
}));
