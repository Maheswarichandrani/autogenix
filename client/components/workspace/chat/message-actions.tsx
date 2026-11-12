"use client";

import { Check, Copy, RotateCw, Square, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { useCopy } from "@/hooks/use-copy";
import { useReadAloud } from "@/hooks/use-read-aloud";
import { useLocalFeedback } from "@/hooks/use-local-feedback";
import { stripAgentMarkers } from "@/lib/agent-markers";
import { cn } from "@/lib/utils";
import { IconAction } from "../icon-action";

/** Copy · read aloud · thumbs · retry, under the last reply of a turn. */
export function MessageActions({
  messageId,
  text,
  onRetry,
  retryDisabled,
}: {
  messageId: string;
  text: string;
  /** Only the latest turn can be retried */
  onRetry?: () => void;
  retryDisabled?: boolean;
}) {
  const plain = stripAgentMarkers(text);
  const { copied, copy } = useCopy();
  const speech = useReadAloud();
  const { feedback, set } = useLocalFeedback(messageId);

  return (
    <div className="mt-3 flex items-center gap-0.5 text-muted-foreground animate-in fade-in duration-300">
      <IconAction size="sm" label={copied ? "Copied" : "Copy"} tooltipSide="bottom" onClick={() => copy(plain)}>
        {copied ? <Check /> : <Copy />}
      </IconAction>

      {speech.isSupported && (
        <IconAction
          size="sm"
          label={speech.speaking ? "Stop reading" : "Read aloud"}
          active={speech.speaking}
          onClick={() => speech.toggle(plain)}
        >
          {speech.speaking ? <Square className="fill-current" /> : <Volume2 />}
        </IconAction>
      )}

      <IconAction size="sm" label="Good response" active={feedback === "up"} onClick={() => set("up")}>
        <ThumbsUp className={cn(feedback === "up" && "fill-current")} />
      </IconAction>
      <IconAction size="sm" label="Bad response" active={feedback === "down"} onClick={() => set("down")}>
        <ThumbsDown className={cn(feedback === "down" && "fill-current")} />
      </IconAction>

      {onRetry && (
        <IconAction
          size="sm"
          label={retryDisabled ? "Wait for the build to finish" : "Retry (starts a new build)"}
          disabled={retryDisabled}
          onClick={onRetry}
        >
          <RotateCw />
        </IconAction>
      )}
    </div>
  );
}
