"use client";

/**
 * hooks/use-workflow.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REAL STREAMING BUG — React 18 automatic batching
 * ───────────────────────────── ────────────────────────────────────────────────
 *
 *   React 18 introduced automatic batching for ALL state updates, including
 *   those triggered from native event handlers like EventSource.onmessage.
 *
 *   Before React 18: only updates inside React synthetic event handlers were batched.
 *   After React 18:  EVERYTHING is batched — setTimeout, Promises, native
 *                    event listeners, SSE onmessage — everything.
 *
 *   Result: 100 text_chunk events fire in rapid succession. Each calls
 *   Zustand set(). React sees 100 set() calls in the same event loop task
 *   and says "I'll batch these into ONE re-render at the end."
 *   The component only re-renders ONCE — showing the fully accumulated text.
 *   Streaming appears completely broken even though data arrives correctly.
 *
 *   THE FIX: `flushSync` from react-dom
 *   flushSync(() => update()) forces React to flush and commit the DOM
 *   synchronously BEFORE returning. It opts out of batching for that call.
 *   Since it runs inside a native onmessage callback (outside React's
 *   scheduler), React cannot re-batch it.
 *
 *   We apply flushSync ONLY to high-frequency streaming events:
 *     text_chunk, step, tool_call, tool_result, thinking
 *
 *   NOT for: done, error, stage_change, close_stream — one-shot events
 *   where batching is harmless. Over-using flushSync degrades performance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture
 * ─────────────────────────────────────────────────────────────────────────────
 *   - TanStack Query: ONLY for initial history fetch. Seeds Zustand once.
 *   - Zustand: single source of truth for ALL live state after that.
 *   - connectSSE has projectId as its ONLY dep — never reconnects due to
 *     handler reference changes because we read from getState() in onmessage.
 */

import { useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useWorkflowStore } from "@/store/workflow-store";
import { messagesAPI } from "@/lib/api/messages";
import type { UserAction, Message, SSEEvent, WorkflowStage } from "@/types/workflow";

export const workflowKeys = {
  messages: (projectId: string) => ["messages", projectId] as const,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Events that MUST render immediately — opt out of React 18 automatic batching
const LIST_REFRESH_EVENTS = new Set([
  "project_renamed", "stage_change", "done", "build_failed", "close_stream",
]);

const FLUSH_EVENT_TYPES = new Set([
  "text_chunk",
  "step",
  "tool_call",
  "tool_result",
  "thinking",
  "agent_paused",
  "agent_resumed",
]);

export function useWorkflow(projectId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // ── Store actions ──────────────────────────────────────────────────────────
  const hydrateMessages = useWorkflowStore((s) => s.hydrateMessages);
  const addOptimisticMessage = useWorkflowStore((s) => s.addOptimisticMessage);
  const confirmOptimisticMessage = useWorkflowStore((s) => s.confirmOptimisticMessage);
  const removeOptimisticMessage = useWorkflowStore((s) => s.removeOptimisticMessage);
  const setWorkflowPending = useWorkflowStore((s) => s.setWorkflowPending);
  const reset = useWorkflowStore((s) => s.reset);

  // ── Rendered state (optimized selectors for performance) ───────────────────
  const messages = useWorkflowStore((s) => s.messages);
  const stage = useWorkflowStore((s) => s.stage);
  const active_role = useWorkflowStore((s) => s.active_role);
  const is_streaming = useWorkflowStore((s) => s.is_streaming);
  const isThinking = useWorkflowStore((s) => s.isThinking);
  const thinkingStatus = useWorkflowStore((s) => s.thinkingStatus);
  const stepFeed = useWorkflowStore((s) => s.stepFeed);
  const error = useWorkflowStore((s) => s.error);
  const isPendingWorkflowStart = useWorkflowStore((s) => s.isPendingWorkflowStart);

  const isPaused = useWorkflowStore((s) => s.isPaused);
  const pauseReason = useWorkflowStore((s) => s.pauseReason);
  const pausedRole = useWorkflowStore((s) => s.pausedRole);
  const pausedModel = useWorkflowStore((s) => s.pausedModel);
  const pausedIteration = useWorkflowStore((s) => s.pausedIteration);
  const pausedMaxIterations = useWorkflowStore((s) => s.pausedMaxIterations);

  // CRITICAL: Separate selector for streaming text to maximize performance
  const inProgressMessage = useWorkflowStore((s) => s.inProgressMessage);

  // ── Initial history load (TQ used only here) ───────────────────────────────
  const { isLoading: isLoadingHistory, isError: isHistoryError } = useQuery({
    queryKey: workflowKeys.messages(projectId),
    queryFn: async () => {
      const response = await messagesAPI.list(projectId, 0, 50);
      if (response.error) throw new Error(response.error);
      return response.data!;
    },
    enabled: !!projectId && projectId !== "undefined",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  // Seed Zustand once when TQ gets fresh history
  const historyData = queryClient.getQueryData<{
    messages: Message[];
    active_build?: { status: string };
  }>(workflowKeys.messages(projectId));

  useEffect(() => {
    if (historyData?.messages) {
      hydrateMessages(historyData.messages);
    }
  }, [historyData, hydrateMessages]);

  // Restore stage on page reload mid-build
  useEffect(() => {
    const activeBuild = historyData?.active_build;
    if (!activeBuild) return;

    const statusToStage: Record<string, WorkflowStage> = {
      building: "building",
      running: "building",
      thinking: "thinking",
      testing: "testing",
      fixing: "fixing",
      deploying: "deploying",
      waiting_env: "waiting_env",
    };

    const restored = statusToStage[activeBuild.status];
    if (restored) useWorkflowStore.setState({ stage: restored });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData?.active_build?.status]);

  // ── SSE connection ─────────────────────────────────────────────────────────
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectSSE = useCallback(() => {
    if (!projectId || projectId === "undefined") return;

    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    const url = `${API_BASE}/api/v1/projects/${projectId}/messages/stream`;
    if (process.env.NODE_ENV === "development") {
      console.log("[SSE] Connecting:", url);
    }

    const es = new EventSource(url, { withCredentials: true });

    es.onopen = () => {
      if (process.env.NODE_ENV === "development") console.log("[SSE] Connected");
    };

    es.onmessage = (rawEvent) => {
      let sseEvent: SSEEvent;
      try {
        sseEvent = JSON.parse(rawEvent.data);
      } catch (err) {
        console.error("[SSE] Parse error:", err, rawEvent.data);
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[SSE] event:", sseEvent.type, sseEvent);
      }

      // Always read handler fresh from store — no stale closure, no reconnects.
      const handle = useWorkflowStore.getState().handleSSEEvent;

      // The sidebar's project list shows names and status dots: refresh it when they change
      if (LIST_REFRESH_EVENTS.has(sseEvent.type)) {
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      }
      // New title: re-read the page's project so the header shows it too
      if (sseEvent.type === "project_renamed") {
        router.refresh();
      }

      if (FLUSH_EVENT_TYPES.has(sseEvent.type)) {
        // ── STREAMING FIX ───────────────────────────────────────────────
        // flushSync forces React to commit this state update synchronously,
        // bypassing automatic batching. The store is updated immediately so
        // the useTypewriter hook's targetRef always has fresh text.
        //
        // The actual visual typewriter effect is handled by useTypewriter
        // in StreamingMarkdown — it reveals characters at a natural pace
        // using requestAnimationFrame, decoupled from SSE arrival timing.
        flushSync(() => {
          handle(sseEvent);
        });
      } else {
        handle(sseEvent);
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        if (process.env.NODE_ENV === "development") {
          console.log("[SSE] Server closed connection (normal end of stream)");
        }
        es.close();
        return;
      }

      console.warn("[SSE] Connection error — retrying in 3s");
      es.close();

      // Always retry — the SSE should stay open for the lifetime of the
      // workspace page.  close_stream no longer kills the connection, so
      // onerror only fires on real network failures worth retrying.
      retryRef.current = setTimeout(() => connectSSE(), 3_000);
    };

    eventSourceRef.current = es;
  }, [projectId, queryClient, router]); // projectId drives reconnects; the other two are stable

  useEffect(() => {
    connectSSE();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connectSSE]);

  useEffect(() => {
    reset();
  }, [projectId, reset]);

  // ── Ensure SSE is alive before sending ────────────────────────────────────
  const ensureSSEConnected = useCallback(() => {
    const state = eventSourceRef.current?.readyState;
    if (state === undefined || state === EventSource.CLOSED) {
      if (process.env.NODE_ENV === "development") {
        console.log("[SSE] Reconnecting before send");
      }
      connectSSE();
    }
  }, [connectSSE]);

  // ── Send message / action ──────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (action: UserAction) => {
      const response = await messagesAPI.sendAction(projectId, action);
      if (response.error) throw new Error(response.error as string);
      return response.data!;
    },

    onMutate: async (action) => {
      // Agent control actions don't create user messages
      if (action.action === "agent_continue" || action.action === "agent_switch_model" || action.action === "agent_cancel") {
        return {};
      }
      // Mirrors the text the server stores for provide_env_vars — never the values.
      const text =
        action.action === "provide_env_vars"
          ? "Submitted environment variables for deployment."
          : "content" in action ? action.content : "";
      if (text) {
        const tempId = `temp-${Date.now()}`;
        addOptimisticMessage({
          id: tempId,
          role: "user",
          message_type: "user_prompt",
          content: [{ type: "text", content: text }],
          created_at: new Date().toISOString(),
        });
        return { tempId };
      }
    },

    onSuccess: (response, _action, context) => {
      if (context?.tempId) {
        confirmOptimisticMessage(context.tempId, response.user_message_id);
      }
      // Set pending state after successful send to show interim loading
      setWorkflowPending(true);
    },

    onError: (err, _action, context) => {
      if (context?.tempId) removeOptimisticMessage(context.tempId);
      setWorkflowPending(false); // Clear pending state on error
      useWorkflowStore.setState({
        stage: "error",
        error: err instanceof Error ? err.message : "Failed to send message",
      });
    },
  });

  return {
    messages,
    stage,
    active_role,
    is_streaming,
    isThinking,
    thinkingStatus,
    stepFeed,
    inProgressMessage,
    error,
    isLoadingHistory,
    isHistoryError,
    isSending: sendMutation.isPending,
    isPendingWorkflowStart,
    isPaused,
    pauseReason,
    pausedRole,
    pausedModel,
    pausedIteration,
    pausedMaxIterations,
    sendAction: (action: UserAction) => {
      ensureSSEConnected();
      sendMutation.mutate(action);
    },
    // Same path as sendAction, but the caller can await success or failure.
    sendActionAsync: async (action: UserAction) => {
      ensureSSEConnected();
      await sendMutation.mutateAsync(action);
    },
  };
}