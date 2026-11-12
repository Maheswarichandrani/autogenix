"use client";

import { useCallback, useState } from "react";

export type Feedback = "up" | "down" | null;

const key = (messageId: string) => `autogenix-feedback-${messageId}`;

function read(messageId: string): Feedback {
  try {
    const v = localStorage.getItem(key(messageId));
    return v === "up" || v === "down" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Thumbs up / down on a reply. Kept in this browser only; nothing is sent to
 * the server yet. Clicking the active thumb clears it.
 */
export function useLocalFeedback(messageId: string) {
  const [feedback, setFeedback] = useState<Feedback>(() => (typeof window === "undefined" ? null : read(messageId)));

  const set = useCallback(
    (value: Exclude<Feedback, null>) => {
      setFeedback((prev) => {
        const next = prev === value ? null : value;
        try {
          if (next) localStorage.setItem(key(messageId), next);
          else localStorage.removeItem(key(messageId));
        } catch {
          /* storage blocked: keep it for this session only */
        }
        return next;
      });
    },
    [messageId],
  );

  return { feedback, set };
}
