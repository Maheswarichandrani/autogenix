"use client";

/**
 * workspace-actions-context.tsx
 *
 * Lets interactive artifact cards (e.g. the deploy card) send workflow
 * actions through the same useWorkflow mutation as the chat input, without
 * prop-drilling through every message component.
 */

import { createContext, useContext } from "react";
import type { UserAction } from "@/types/workflow";

interface WorkspaceActions {
  projectId:       string;
  sendActionAsync: (action: UserAction) => Promise<void>;
}

const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null);

export const WorkspaceActionsProvider = WorkspaceActionsContext.Provider;

export function useWorkspaceActions(): WorkspaceActions | null {
  return useContext(WorkspaceActionsContext);
}
