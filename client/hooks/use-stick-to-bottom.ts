"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const NEAR_BOTTOM_PX = 120;

/**
 * Keeps a scroll container pinned to the bottom while new content arrives,
 * but only if the reader is already near the bottom. Scrolling up to read
 * stops the pinning until they come back down (or press the ↓ button).
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, contentKey: unknown) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      atBottomRef.current = near;
      setIsAtBottom(near);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  // New content: follow it only if the reader was at the bottom
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [ref, contentKey]);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    atBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [ref]);

  return { isAtBottom, scrollToBottom };
}
