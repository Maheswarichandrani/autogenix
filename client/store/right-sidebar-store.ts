"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Pipeline v2: Code panel, Settings, and Idle state
export type RightSidebarState = 
  | "idle"           // Empty state / ideal state
  | "code"           // Code viewer (file tree + code)
  | "settings";      // Settings panel

// No complex payloads needed — code store manages its own state
export type RightSidebarPayload = null;

// Store interface
export interface RightSidebarStore {
  currentState: RightSidebarState;
  payload: RightSidebarPayload;
  isVisible: boolean;
  
  showCode: () => void;
  showSettings: () => void;
  setIdle: () => void;
  hide: () => void;
  toggle: () => void;
  
  isState: (state: RightSidebarState) => boolean;
}

// Create the store
export const useRightSidebar = create<RightSidebarStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentState: "idle",
      payload: null,
      isVisible: false,

      showCode: () =>
        set(
          { 
            currentState: "code", 
            payload: null, 
            isVisible: true 
          },
          false,
          "showCode"
        ),

      showSettings: () =>
        set(
          { 
            currentState: "settings", 
            payload: null, 
            isVisible: true 
          },
          false,
          "showSettings"
        ),

      setIdle: () =>
        set(
          { 
            currentState: "idle", 
            payload: null, 
            isVisible: true 
          },
          false,
          "setIdle"
        ),

      hide: () =>
        set(
          { 
            isVisible: false 
          },
          false,
          "hide"
        ),

      toggle: () =>
        set(
          (state) => ({ 
            isVisible: !state.isVisible 
          }),
          false,
          "toggle"
        ),

      // Utility functions
      isState: (state) => get().currentState === state,
    }),
    {
      name: "right-sidebar-store",
    }
  )
);

// Selector hooks for easier usage
export const useRightSidebarState = () => useRightSidebar((state) => state.currentState);
export const useRightSidebarVisible = () => useRightSidebar((state) => state.isVisible);

// Action hooks
export const useRightSidebarActions = () => {
  const {
    showCode,
    showSettings,
    setIdle,
    hide,
    toggle,
  } = useRightSidebar();

  return {
    showCode,
    showSettings,
    setIdle,
    hide,
    toggle,
  };
};
