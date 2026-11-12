"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Feedback = "up" | "down" | null;

const key = (messageId: string) => `autogenix-feedback-${messageId}`;
const CHANGE_EVENT = "autogenix-feedback-change";

function read(messageId: string): Feedback {
  try {
    const v = localStorage.getItem(key(messageId));
    return v === "up" || v === "down" ? v : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Thumbs up / down on a reply. Kept in this browser only; nothing is sent to
 * the server yet. Clicking the active thumb clears it. The server render (and
 * hydration) see no feedback; the saved value applies right after.
 */
export function useLocalFeedback(messageId: string) {
  const feedback = useSyncExternalStore(
    subscribe,
    () => read(messageId),
    () => null,
  );

  const set = useCallback(
    (value: Exclude<Feedback, null>) => {
      const next = read(messageId) === value ? null : value;
      try {
        if (next) localStorage.setItem(key(messageId), next);
        else localStorage.removeItem(key(messageId));
      } catch {
        /* storage blocked: nothing to remember */
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [messageId],
  );

  return { feedback, set };
}
