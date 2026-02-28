"use client";

import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Progressive text reveal hook for streaming UI.
 *
 * Takes the accumulated text from the store and reveals it character-by-character
 * using requestAnimationFrame. This creates a smooth typewriter effect regardless
 * of how fast SSE chunks arrive from the backend.
 *
 * WHY THIS IS NEEDED:
 * The backend publishes all text_chunk events in a tight synchronous loop
 * (no delay between words). Redis delivers them all within milliseconds.
 * sse-starlette flushes each event, but they arrive at the browser in the
 * same ~16ms animation frame. Even with flushSync, the browser only paints
 * once per frame — so all text appears at once.
 *
 * This hook decouples "data received" from "data displayed":
 * - The store updates instantly (flushSync → state is correct)
 * - This hook reveals characters at a natural reading pace (~180 chars/sec)
 * - When streaming stops, the return value switches to the full text instantly
 *
 * @param targetText   - Full accumulated text from the store
 * @param isStreaming   - Whether streaming is active (from is_streaming state)
 * @param charsPerFrame - Base characters to reveal per animation frame (~60fps)
 */
export function useTypewriter(
    targetText: string,
    isStreaming: boolean,
    charsPerFrame: number = 3,
): string {
    // revealedText is only updated by the rAF loop during streaming.
    // When not streaming, we return targetText directly (bypass this state).
    const [revealedText, setRevealedText] = useState("");

    const cursorRef = useRef(0);
    const targetRef = useRef(targetText);
    const streamingRef = useRef(isStreaming);
    const rafRef = useRef<number | null>(null);

    // Sync refs via passive effect (React 19 compliant)
    useEffect(() => {
        targetRef.current = targetText;
        streamingRef.current = isStreaming;
    });

    const cancelLoop = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    // ── Main animation loop ────────────────────────────────────────────────
    // Starts when streaming begins, stops when streaming ends.
    // The effect cleanup runs when isStreaming transitions to false.
    useEffect(() => {
        if (!isStreaming) {
            // Streaming just stopped — cancel any running loop and reset cursor
            // so the next streaming session starts fresh.
            cancelLoop();
            cursorRef.current = 0;
            return;
        }

        // Start the rAF loop for progressive reveal
        function tick() {
            const target = targetRef.current;
            const cursor = cursorRef.current;

            if (cursor < target.length) {
                // Adaptive speed: catch up faster when there's a large backlog
                const backlog = target.length - cursor;
                const chars = backlog > 80
                    ? Math.ceil(backlog * 0.15)   // fast catch-up
                    : backlog > 30
                        ? Math.ceil(backlog * 0.1)  // moderate catch-up
                        : charsPerFrame;            // normal speed

                cursorRef.current = Math.min(cursor + chars, target.length);
                setRevealedText(target.slice(0, cursorRef.current));
            }

            // Keep looping while streaming is active
            if (streamingRef.current) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
            }
        }

        rafRef.current = requestAnimationFrame(tick);
        return cancelLoop;
    }, [isStreaming, charsPerFrame, cancelLoop]);

    // During streaming: show progressively revealed text.
    // When not streaming: show full target text directly (instant switch).
    return isStreaming ? revealedText : targetText;
}
