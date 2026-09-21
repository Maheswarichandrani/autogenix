/**
 * lib/api/messages.ts
 *
 * KEY FIXES:
 *  1. deployConfirm() REMOVED — it called POST /messages/deploy-confirm
 *     which no longer exists. Env var submission is now:
 *       sendAction(projectId, { action: "provide_env_vars", vars: {...} })
 *     which hits POST /messages (the unified endpoint).
 *
 *  2. sendAction body construction cleaned up — action, content, and vars
 *     are all handled in one place with no ambiguity.
 */

import { apiFetch } from "./fetch";
import { API_ENDPOINTS } from "./config";
import type {
  Message,
  UserAction,
  MessagesResponse,
  SendMessageResponse,
} from "@/types/workflow";

export type { MessagesResponse, SendMessageResponse };

export const messagesAPI = {
  /**
   * Get paginated message history.
   * GET /api/v1/projects/:id/messages
   */
  list: async (projectId: string, offset = 0, limit = 50) => {
    return apiFetch<MessagesResponse>(
      API_ENDPOINTS.messages.list(projectId),
      {
        method: "GET",
        params: { offset: String(offset), limit: String(limit) },
      }
    );
  },

  /**
   * Send a user action to the workflow.
   * POST /api/v1/projects/:id/messages
   *
   * Handles all actions in the unified endpoint:
   *   { action: "send_message",       content: string }
   *   { action: "provide_env_vars",   vars: Record<string, string> }
   *   { action: "agent_continue",     budget?: number }
   *   { action: "agent_switch_model", model: string, budget?: number }
   *   { action: "agent_cancel" }
   */
  sendAction: async (projectId: string, userAction: UserAction) => {
    const body: Record<string, unknown> = { action: userAction.action };

    if ("content" in userAction && userAction.content != null) {
      body.content = userAction.content;
    }
    if ("vars" in userAction && userAction.vars != null) {
      body.vars = userAction.vars;
    }
    if ("model" in userAction && userAction.model != null) {
      body.model = userAction.model;
    }
    if ("budget" in userAction && userAction.budget != null) {
      body.budget = userAction.budget;
    }

    return apiFetch<SendMessageResponse>(
      API_ENDPOINTS.messages.create(projectId),
      { method: "POST", body }
    );
  },

  /**
   * Get the SSE stream URL for a project.
   * Used by useWorkflow to construct the EventSource URL.
   */
  getStreamURL: (projectId: string): string => {
    return API_ENDPOINTS.messages.stream(projectId);
  },
};