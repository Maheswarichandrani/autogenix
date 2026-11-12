"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Reads text aloud with the browser's built-in voice. Nothing leaves the browser. */
export function useReadAloud() {
  const isSupported = useSyncExternalStore(() => () => {}, supported, () => false);
  const [speaking, setSpeaking] = useState(false);

  // Stop when the message unmounts (e.g. switching projects)
  useEffect(() => () => {
    if (supported()) window.speechSynthesis.cancel();
  }, []);

  const toggle = useCallback((text: string) => {
    if (!supported()) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel(); // another message may be speaking
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }, [speaking]);

  return { isSupported, speaking, toggle };
}
