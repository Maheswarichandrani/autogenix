/**
 * types/workflow.ts
 *
 * KEY ADDITIONS:
 *  1. "step" event — appended to feed timeline (Copilot-style), never replaces.
 *     Emitted by backend for each tool execution with tool name + human status.
 *  2. tool_call / tool_result now carry is_error flag for UI coloring.
 *  3. WorkflowStage unchanged — "thinking" is still set internally by store.
 */

// ─── Stage ────────────────────────────────────────────────────────────────────

export type WorkflowStage =
  | "idle"
  | "thinking"
  | "building"
  | "testing"
  | "fixing"
  | "deploying"
  | "waiting_env"
  | "complete"
  | "error";

// ─── SSE Events ───────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "stage_change"; stage: WorkflowStage }
  // Replaces the single pulsing status indicator — "Reasoning..."
  | { type: "thinking";     status: string; role: string }
  // APPENDS a new row to the step timeline feed — "Writing app.py...", etc.
  | { type: "step";         status: string; role: string; tool: string }
  | { type: "agent_start";  role: string }
  | { type: "agent_done";   role: string }
  // Incremental text streaming — each event appends one word/chunk
  | { type: "text_chunk";   chunk: string; role: string }
  | { type: "artifact";     artifact_type: string; title: string; content: unknown }
  // Tool detail events — appended to feed below their parent "step" row
  | { type: "tool_call";    role: string; tool: string; input: string }
  | { type: "tool_result";  role: string; tool: string; result: string; is_error: boolean }
  | { type: "file_created"; path: string; content: string; lines: number; size: number }
  | { type: "file_deleted"; path: string }
  | { type: "done";         deploy_url?: string; repo_url?: string; status?: string }
  | { type: "close_stream" }
  | { type: "build_failed"; reason: string }
  | { type: "error";        message: string }
  // Agent lifecycle control events
  | { type: "agent_paused";    role: string; iteration: number; max_iterations: number; reason: string }
  | { type: "agent_resumed";   role: string; model: string; budget: number }
  | { type: "agent_cancelled"; role: string; reason: string }
  | { type: "model_switched";  role: string; old_model: string; new_model: string };

// ─── Step feed item (built from step/tool_call/tool_result events) ────────────

export interface StepFeedItem {
  id:        string;   // unique per step
  tool:      string;
  status:    string;
  role:      string;
  input?:    string;
  result?:   string;
  is_error?: boolean;
  // "pending" → tool_call received, "done" → tool_result received
  state:     "pending" | "done";
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageRole =
  | "user"
  | "conductor"
  | "artificer"
  | "guardian"
  | "deployer"
  | "system";

export interface Message {
  id:           string;
  role:         MessageRole;
  message_type: string;
  content: Array<
    | { type: "text";     content: string }
    | {
        type:          "artifact";
        artifact_id:   string;
        artifact_data?: {
          artifact_type: string;
          title:         string;
          content:       unknown;
        };
      }
  >;
  created_at: string;
}

// ─── User Actions ─────────────────────────────────────────────────────────────

export type UserAction =
  | { action: "send_message";     content: string }
  | { action: "provide_env_vars"; vars: Record<string, string> }
  | { action: "agent_continue";   budget?: number }
  | { action: "agent_switch_model"; model: string; budget?: number }
  | { action: "agent_cancel" };

// ─── API response types ───────────────────────────────────────────────────────

export interface MessagesResponse {
  messages:     Message[];
  total:        number;
  offset:       number;
  has_more:     boolean;
  active_build: { id: string; status: string } | null;
}

export interface SendMessageResponse {
  user_message_id: string;
  thread_id:       string;
  status:          string;
  stream_url:      string;
}