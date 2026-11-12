import type { SavedStep, StepFeedItem } from "@/types/workflow";
import type { StepView } from "./step-list";

export function liveStepsToView(steps: StepFeedItem[]): StepView[] {
  return steps.map((s) => ({
    id: s.id,
    status: s.status,
    input: s.input,
    result: s.result,
    isError: s.is_error,
    pending: s.state === "pending",
  }));
}

export function savedStepsToView(steps: SavedStep[] | undefined, messageId: string): StepView[] {
  return (steps ?? []).map((s, i) => ({
    id: `${messageId}-${i}`,
    status: s.status || s.tool,
    input: s.input || undefined,
    result: s.result || undefined,
    isError: s.is_error,
  }));
}
