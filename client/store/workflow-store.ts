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
import type { WorkflowStage, Message, SSEEvent, StepFeedItem, SavedStep } from "@/types/workflow";

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

  // ── Interim loading state (between message sent and workflow start)
  isPendingWorkflowStart: boolean;

  // ── Paused state (agent budget exhausted, waiting for user decision)
  isPaused: boolean;
  pauseReason: string | null;
  pausedRole: string | null;
  pausedModel: string | null;
  pausedIteration: number;
  pausedMaxIterations: number;

  // ── Thinking indicator (single pulsing status bar — replaces itself)
  isThinking: boolean;
  thinkingStatus: string | null;

  // ── Step feed (Copilot-style timeline — each entry appends, never replaces)
  stepFeed: StepFeedItem[];

  // ── Message being assembled right now from text_chunk events
  inProgressMessage: InProgressMessage | null;

  // ── Sandbox URL of the running app (session only, from app_ready)
  appUrl: string | null;

  // ── Actions
  hydrateMessages: (messages: Message[]) => void;
  addOptimisticMessage: (message: Message) => void;
  confirmOptimisticMessage: (tempId: string, realId: string) => void;
  removeOptimisticMessage: (tempId: string) => void;
  setWorkflowPending: (pending: boolean) => void;
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
  isPendingWorkflowStart: false,
  isPaused: false,
  pauseReason: null as string | null,
  pausedRole: null as string | null,
  pausedModel: null as string | null,
  pausedIteration: 0,
  pausedMaxIterations: 0,
  isThinking: false,
  thinkingStatus: null as string | null,
  stepFeed: [] as StepFeedItem[],
  inProgressMessage: null as InProgressMessage | null,
  appUrl: null as string | null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSavedSteps(steps: StepFeedItem[]): SavedStep[] {
  return steps.map((st) => ({
    tool:     st.tool,
    status:   st.status,
    is_error: !!st.is_error,
    input:    st.input ?? "",
    result:   st.result ?? "",
  }));
}

function commitInProgress(ip: InProgressMessage, steps: StepFeedItem[] = []): Message | null {
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
    metadata: steps.length ? { steps: toSavedSteps(steps) } : null,
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

  setWorkflowPending: (pending: boolean) => {
    set({ isPendingWorkflowStart: pending });
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
    if (process.env.NODE_ENV === "development") {
      console.log("[WorkflowStore] SSE:", event.type, event);
    }

    // Clear pending state on any SSE event (workflow has started)
    const currentState = get();
    if (currentState.isPendingWorkflowStart) {
      set({ isPendingWorkflowStart: false });
    }

    switch (event.type) {

      // ── Stage transitions ─────────────────────────────────────
      case "stage_change":
        set({ stage: event.stage, error: null });
        break;

      // ── Running app URL for the code panel preview ────────────
      case "app_ready":
        set({ appUrl: event.url });
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
          startedAt: Date.now(),
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
        const toCommit = existing ? commitInProgress(existing, get().stepFeed) : null;

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

      // ── Text chunk — append to inProgressMessage.text ─────────
      // The store updates immediately (flushSync in the SSE hook).
      // The visual typewriter effect is handled by useTypewriter in
      // StreamingMarkdown — it reveals chars at a natural pace.
      case "text_chunk":
        set((s) => {
          const currentMessage = s.inProgressMessage;
          const newText = currentMessage ? currentMessage.text + event.chunk : event.chunk;

          return {
            is_streaming: true,
            isThinking: false,
            thinkingStatus: null,
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
          const committed = ip ? commitInProgress(ip, get().stepFeed) : null;
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

      // ── Close stream (task complete — SSE stays open) ─────────
      // close_stream means the Celery task finished. The SSE connection
      // is persistent, so we just reset transient UI state. If we're
      // already idle (e.g. stale close_stream from a previous session),
      // this is a harmless no-op.
      case "close_stream":
        set((s) => {
          // Only reset if there's actually something to reset
          const isActive = s.is_streaming || s.isThinking || s.stepFeed.length > 0;
          if (!isActive) return s;   // no-op — already idle

          return {
            ...s,
            stage: (["thinking", "building", "testing", "fixing", "deploying"] as WorkflowStage[])
              .includes(s.stage) && !["waiting_env", "complete", "error"].includes(s.stage)
              ? "idle"
              : s.stage,
            is_streaming: false,
            isThinking: false,
            thinkingStatus: null,
            stepFeed: [],
          };
        });
        break;

      // ── Build failed ──────────────────────────────────────────
      case "build_failed":
        set((s) => {
          const ip = s.inProgressMessage;
          const committed = ip ? commitInProgress(ip, get().stepFeed) : null;
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

      // ── Agent paused (budget exhausted, waiting for user) ─────
      case "agent_paused":
        set({
          isPaused: true,
          pauseReason: event.reason,
          pausedRole: event.role,
          pausedIteration: event.iteration,
          pausedMaxIterations: event.max_iterations,
          isThinking: false,
          thinkingStatus: null,
          is_streaming: false,
        });
        break;

      // ── Agent resumed (user chose continue or switch-model) ───
      case "agent_resumed":
        set({
          isPaused: false,
          pauseReason: null,
          pausedRole: null,
          pausedModel: event.model,
          pausedIteration: 0,
          pausedMaxIterations: 0,
          isThinking: true,
          thinkingStatus: `Resuming ${event.role} with ${event.budget} more iterations...`,
          active_role: event.role,
        });
        break;

      // ── Agent cancelled by user ───────────────────────────────
      case "agent_cancelled":
        set((s) => {
          const ip = s.inProgressMessage;
          const committed = ip ? commitInProgress(ip, get().stepFeed) : null;
          const updatedMessages = committed ? [...s.messages, committed] : s.messages;
          return {
            isPaused: false,
            pauseReason: null,
            pausedRole: null,
            pausedModel: null,
            pausedIteration: 0,
            pausedMaxIterations: 0,
            is_streaming: false,
            isThinking: false,
            thinkingStatus: null,
            inProgressMessage: null,
            stepFeed: [],
            messages: updatedMessages,
          };
        });
        break;

      // ── Model switched mid-execution ──────────────────────────
      case "model_switched":
        set({
          pausedModel: event.new_model,
          isThinking: true,
          thinkingStatus: `Switched from ${event.old_model} to ${event.new_model}`,
        });
        break;
    }
  },

  reset: () => set({ ...INITIAL_STATE }),
}));