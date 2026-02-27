/**
 * store/workflow-store.ts
 *
 * Zustand is the SINGLE source of truth for ALL live workflow state —
 * messages, streaming text, step feed, thinking status.
 *
 * KEY ARCHITECTURE DECISIONS:
 *
 * 1. TanStack Query is used ONLY for the initial history fetch (one-time load).
 *    After that, all state lives here. TQ is NOT used to cache or manage
 *    streaming state — doing so caused the "all text appears at once" bug
 *    because TQ batches/deduplicates updates.
 *
 * 2. text_chunk events append directly to inProgressMessage.text.
 *    Each chunk triggers a Zustand set() which causes React to re-render
 *    immediately — giving the true typewriter/streaming effect.
 *
 * 3. stepFeed is a NEW array that accumulates step/tool_call/tool_result
 *    events as a timeline. The UI renders these as a Copilot-style feed
 *    where each entry appends below the previous — never replaces.
 *    "thinking" still replaces a single pulsing status bar (separate state).
 *
 * 4. inProgressMessage is role-keyed — agent_start commits any prior one.
 *
 * 5. hydrateMessages merges server history with optimistic messages safely.
 */

import { create } from "zustand";
import type { WorkflowStage, Message, SSEEvent, StepFeedItem } from "@/types/workflow";
import { useRightSidebar } from "@/store/right-sidebar-store";
import { streamingDebug } from "@/lib/streaming-debug";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InProgressMessage {
  role: string;
  text: string;
  artifact: {
    artifact_type: string;
    title: string;
    content: unknown;
  } | null;
}

interface WorkflowStore {
  // ── Committed messages (history + finished streamed messages)
  messages: Message[];

  // ── Workflow state
  stage: WorkflowStage;
  active_role: string | null;
  is_streaming: boolean;
  error: string | null;

  // ── Thinking indicator (single pulsing status bar — replaces itself)
  isThinking: boolean;
  thinkingStatus: string | null;

  // ── Step feed (Copilot-style timeline — each entry appends, never replaces)
  stepFeed: StepFeedItem[];

  // ── Message being assembled right now from text_chunk events
  inProgressMessage: InProgressMessage | null;

  // ── Actions
  hydrateMessages: (messages: Message[]) => void;
  addOptimisticMessage: (message: Message) => void;
  confirmOptimisticMessage: (tempId: string, realId: string) => void;
  removeOptimisticMessage: (tempId: string) => void;
  handleSSEEvent: (event: SSEEvent) => void;
  reset: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  messages: [] as Message[],
  stage: "idle" as WorkflowStage,
  active_role: null as string | null,
  is_streaming: false,
  error: null as string | null,
  isThinking: false,
  thinkingStatus: null as string | null,
  stepFeed: [] as StepFeedItem[],
  inProgressMessage: null as InProgressMessage | null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function commitInProgress(ip: InProgressMessage): Message | null {
  const content: Message["content"] = [];

  if (ip.artifact) {
    content.push({
      type: "artifact",
      artifact_id: `artifact-${Date.now()}`,
      artifact_data: ip.artifact,
    });
  }

  if (ip.text.trim()) {
    content.push({ type: "text", content: ip.text.trim() });
  }

  if (content.length === 0) return null;

  return {
    id: `streamed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: ip.role as Message["role"],
    message_type: "assistant_response",
    content,
    created_at: new Date().toISOString(),
  };
}

let _stepIdCounter = 0;
function makeStepId() {
  return `step-${Date.now()}-${++_stepIdCounter}`;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  ...INITIAL_STATE,

  hydrateMessages: (serverMessages: Message[]) => {
    const current = get().messages;
    const optimistic = current.filter((m) => m.id.startsWith("temp-"));
    const serverIds = new Set(serverMessages.map((m) => m.id));
    const pending = optimistic.filter((m) => !serverIds.has(m.id));

    // Merge and sort by created_at to maintain chronological order
    const merged = [...serverMessages, ...pending];
    merged.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeA - timeB;
    });

    set({ messages: merged });
  },

  addOptimisticMessage: (message: Message) => {
    set((s) => {
      const updatedMessages = [...s.messages, message];
      // Sort by created_at to maintain chronological order
      updatedMessages.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeA - timeB;
      });
      return { messages: updatedMessages };
    });
  },

  confirmOptimisticMessage: (tempId: string, realId: string) => {
    set((s) => ({
      messages: s.messages.map((m) => m.id === tempId ? { ...m, id: realId } : m),
    }));
  },

  removeOptimisticMessage: (tempId: string) => {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== tempId) }));
  },

  /**
   * STABLE function — reads state via get(), never closes over stale state.
   * Store in a useRef in the hook. Reference never changes.
   *
   * SSE event routing:
   *   "thinking"   → update thinkingStatus (replaces pulsing bar)
   *   "step"       → push new StepFeedItem to stepFeed (appends to timeline)
   *   "tool_call"  → find matching step in feed, attach input
   *   "tool_result"→ find matching step in feed, attach result, mark done
   *   "text_chunk" → append chunk to inProgressMessage.text IMMEDIATELY
   *                  (this is what gives true streaming — no batching)
   */
  handleSSEEvent: (event: SSEEvent) => {
    streamingDebug.sse(event, "RECEIVED");

    if (process.env.NODE_ENV === "development") {
      console.log("[WorkflowStore] SSE:", event.type, event);
    }

    switch (event.type) {

      // ── Stage transitions ─────────────────────────────────────
      case "stage_change":
        set({ stage: event.stage, error: null });
        if (event.stage === "building") {
          useRightSidebar.getState().showCode();
        }
        break;

      // ── Thinking (replaces single status bar) ─────────────────
      case "thinking":
        set({
          isThinking: true,
          thinkingStatus: event.status,
          active_role: event.role ?? null,
          stage: get().stage === "idle" ? "thinking" : get().stage,
        });
        break;

      // ── Step (APPENDS to timeline feed — Copilot style) ────────
      // Each step gets its own row. tool_call/tool_result will attach
      // their data to this step row by matching the tool name.
      case "step": {
        const newStep: StepFeedItem = {
          id: makeStepId(),
          tool: event.tool,
          status: event.status,
          role: event.role,
          state: "pending",
        };
        set((s) => ({
          stepFeed: [...s.stepFeed, newStep],
          // Clear the pulsing "thinking" bar when an actual step begins
          isThinking: false,
          thinkingStatus: null,
        }));
        break;
      }

      // ── Tool call detail (attaches input to most recent matching step) ──
      case "tool_call": {
        set((s) => {
          // Find the last step with this tool that has no input yet
          const feed = [...s.stepFeed];
          for (let i = feed.length - 1; i >= 0; i--) {
            if (feed[i].tool === event.tool && !feed[i].input) {
              feed[i] = { ...feed[i], input: event.input };
              break;
            }
          }
          return { stepFeed: feed };
        });
        break;
      }

      // ── Tool result (attaches result to matching step, marks done) ──
      case "tool_result": {
        set((s) => {
          const feed = [...s.stepFeed];
          for (let i = feed.length - 1; i >= 0; i--) {
            if (feed[i].tool === event.tool && feed[i].state === "pending") {
              feed[i] = {
                ...feed[i],
                result: event.result,
                is_error: event.is_error,
                state: "done",
              };
              break;
            }
          }
          return { stepFeed: feed };
        });
        break;
      }

      // ── Agent starting ────────────────────────────────────────
      case "agent_start": {
        const existing = get().inProgressMessage;
        const toCommit = existing ? commitInProgress(existing) : null;

        set((s) => ({
          active_role: event.role,
          is_streaming: false,
          isThinking: false,
          thinkingStatus: null,
          // Clear the step feed when a new agent starts — each agent
          // gets its own clean feed during its execution window.
          stepFeed: [],
          inProgressMessage: { role: event.role, text: "", artifact: null },
          messages: toCommit ? [...s.messages, toCommit] : s.messages,
        }));
        break;
      }

      // ── Text chunk — ENHANCED STREAMING FIX ───────────────────
      // Force immediate state update with minimal object changes
      // to trigger React re-renders as fast as possible
      case "text_chunk":
        streamingDebug.performance.startStreaming();

        set((s) => {
          const currentMessage = s.inProgressMessage;
          const newText = currentMessage ? currentMessage.text + event.chunk : event.chunk;

          streamingDebug.store("TEXT_CHUNK", {
            currentLength: currentMessage?.text?.length || 0,
            chunkLength: event.chunk.length,
            newLength: newText.length
          });

          return {
            is_streaming: true,
            isThinking: false,
            thinkingStatus: null,
            stepFeed: [],  // clear step feed when text starts flowing
            active_role: event.role,
            inProgressMessage: currentMessage
              ? {
                role: currentMessage.role,
                text: newText,
                artifact: currentMessage.artifact,
              }
              : { role: event.role, text: event.chunk, artifact: null },
          };
        });
        break;

      // ── Artifact received ─────────────────────────────────────
      case "artifact": {
        const artifactData = {
          artifact_type: event.artifact_type,
          title: event.title,
          content: event.content,
        };
        set((s) => ({
          inProgressMessage: s.inProgressMessage
            ? { ...s.inProgressMessage, artifact: artifactData }
            : { role: "system", text: "", artifact: artifactData },
        }));
        break;
      }

      // ── Agent done ────────────────────────────────────────────
      case "agent_done":
        set({
          is_streaming: false,
          active_role: null,
          isThinking: false,
          thinkingStatus: null,
        });
        break;

      // ── Stream done — commit inProgressMessage to messages[] ──
      case "done": {
        const ip = get().inProgressMessage;
        set((s) => {
          const committed = ip ? commitInProgress(ip) : null;
          const updatedMessages = committed ? [...s.messages, committed] : s.messages;

          // Sort by created_at to maintain chronological order
          updatedMessages.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          });

          return {
            messages: updatedMessages,
            inProgressMessage: null,
            is_streaming: false,
            isThinking: false,
            thinkingStatus: null,
            stepFeed: [],
          };
        });

        const doneEvent = event as SSEEvent & { deploy_url?: string; repo_url?: string };
        if (doneEvent.deploy_url) {
          // useRightSidebar.getState().setDeployUrl?.(doneEvent.deploy_url, doneEvent.repo_url);
        }
        break;
      }

      // ── Close stream (entire workflow complete) ───────────────
      case "close_stream":
        set((s) => ({
          stage: (["thinking", "building", "testing", "fixing", "deploying"] as WorkflowStage[])
            .includes(s.stage) && !["waiting_env", "complete", "error"].includes(s.stage)
            ? "idle"
            : s.stage,
          is_streaming: false,
          isThinking: false,
          thinkingStatus: null,
          stepFeed: [],
        }));
        break;

      // ── Build failed ──────────────────────────────────────────
      case "build_failed":
        set((s) => {
          const ip = s.inProgressMessage;
          const committed = ip ? commitInProgress(ip) : null;
          const updatedMessages = committed ? [...s.messages, committed] : s.messages;

          // Sort by created_at to maintain chronological order
          updatedMessages.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          });

          return {
            stage: "error",
            error: (event as { reason?: string }).reason ?? "Build failed",
            is_streaming: false,
            isThinking: false,
            thinkingStatus: null,
            inProgressMessage: null,
            stepFeed: [],
            messages: updatedMessages,
          };
        });
        break;

      // ── Error ─────────────────────────────────────────────────
      case "error":
        set({
          stage: "error",
          error: event.message,
          is_streaming: false,
          isThinking: false,
          thinkingStatus: null,
          inProgressMessage: null,
          stepFeed: [],
        });
        break;
    }
  },

  reset: () => set({ ...INITIAL_STATE }),
}));