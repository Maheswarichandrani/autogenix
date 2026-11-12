"use client";

/**
 * hooks/use-code-stream.ts
 *
 * EventSource hook for the code panel's live file stream.
 *
 * Connects to GET /api/v1/projects/{projectId}/messages/code-stream
 * which subscribes to the project:{id}:code Redis channel.
 *
 * Architecture mirrors use-workflow.ts:
 *   - EventSource native browser API for SSE
 *   - flushSync for file_created events (they can arrive rapidly during builds)
 *   - Reads handler from store via getState() — no stale closures
 *   - projectId is the ONLY dependency for the connection
 */

import { useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { useCodeStreamStore } from "@/store/code-stream-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { CodeStreamEvent } from "@/store/code-stream-store";
import { projectsAPI } from "@/lib/api/projects";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// file_created events can arrive rapidly during a build — flush immediately
const FLUSH_EVENT_TYPES = new Set(["file_created", "file_deleted"]);

export function useCodeStream(projectId: string) {
    const eventSourceRef = useRef<EventSource | null>(null);
    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectRef = useRef<() => void>(() => { });

    // Store actions (stable references via selectors)
    const setConnected = useCodeStreamStore((s) => s.setConnected);
    const reset = useCodeStreamStore((s) => s.reset);

    // Reactive state for consumers
    const fileTree = useCodeStreamStore((s) => s.fileTree);
    const openTabs = useCodeStreamStore((s) => s.openTabs);
    const activeTabId = useCodeStreamStore((s) => s.activeTabId);
    const fileCount = useCodeStreamStore((s) => s.fileCount);
    const isConnected = useCodeStreamStore((s) => s.isConnected);

    const connectSSE = useCallback(() => {
        if (!projectId || projectId === "undefined") return;

        // Cleanup existing connection
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        if (retryRef.current) {
            clearTimeout(retryRef.current);
            retryRef.current = null;
        }

        const url = `${API_BASE}/api/v1/projects/${projectId}/messages/code-stream`;
        if (process.env.NODE_ENV === "development") {
            console.log("[CodeSSE] Connecting:", url);
        }

        const es = new EventSource(url, { withCredentials: true });

        es.onopen = () => {
            if (process.env.NODE_ENV === "development") {
                console.log("[CodeSSE] Connected");
            }
            useCodeStreamStore.getState().setConnected(true);
        };

        es.onmessage = (rawEvent) => {
            let event: CodeStreamEvent;
            try {
                event = JSON.parse(rawEvent.data);
            } catch (err) {
                console.error("[CodeSSE] Parse error:", err, rawEvent.data);
                return;
            }

            if (process.env.NODE_ENV === "development") {
                console.log("[CodeSSE] event:", event.type, event);
            }

            // Always read handler fresh from store — no stale closure
            const handle = useCodeStreamStore.getState().handleCodeEvent;

            if (FLUSH_EVENT_TYPES.has(event.type)) {
                flushSync(() => {
                    handle(event);
                });
                // Lets the chat show a card per file under the agent writing it
                if (event.type === "file_created" || event.type === "file_deleted") {
                    useWorkflowStore.getState().noteFileEvent(event);
                }
            } else {
                handle(event);
            }

            // close_stream is just a state-change signal — the SSE stays open
            // so the next build's events flow through without reconnecting.
        };

        es.onerror = () => {
            if (es.readyState === EventSource.CLOSED) {
                if (process.env.NODE_ENV === "development") {
                    console.log("[CodeSSE] Server closed connection (normal)");
                }
                es.close();
                useCodeStreamStore.getState().setConnected(false);
                return;
            }

            console.warn("[CodeSSE] Connection error — retrying in 5s");
            es.close();
            useCodeStreamStore.getState().setConnected(false);

            // Retry via ref to avoid accessing connectSSE before declaration
            retryRef.current = setTimeout(() => connectRef.current(), 5_000);
        };

        eventSourceRef.current = es;
    }, [projectId]);

    // Keep ref in sync so retry closure always calls the latest connectSSE
    useEffect(() => {
        connectRef.current = connectSSE;
    }, [connectSSE]);

    // Connect on mount, cleanup on unmount
    useEffect(() => {
        connectSSE();
        return () => {
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            if (retryRef.current) clearTimeout(retryRef.current);
            setConnected(false);
        };
    }, [connectSSE, setConnected]);

    // Reset when the project changes, then load the files stored on the server
    // so the code survives reloads and leaving the workspace.
    useEffect(() => {
        reset();
        if (!projectId || projectId === "undefined") return;
        let cancelled = false;
        projectsAPI.getFiles(projectId).then((res) => {
            if (cancelled) return;
            if (res.error || !res.data) {
                console.error("[CodeStream] Could not load stored files:", res.error);
                return;
            }
            useCodeStreamStore.getState().seedFiles(res.data);
        });
        return () => {
            cancelled = true;
        };
    }, [projectId, reset]);

    /**
     * Manually close the code stream.
     * Called by workspace-client when the main workflow stream ends.
     */
    const disconnect = useCallback(() => {
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        if (retryRef.current) clearTimeout(retryRef.current);
        useCodeStreamStore.getState().setConnected(false);
    }, []);

    /**
     * Manually reconnect — useful when a new build starts.
     */
    const reconnect = useCallback(() => {
        connectSSE();
    }, [connectSSE]);

    return {
        fileTree,
        openTabs,
        activeTabId,
        fileCount,
        isConnected,
        disconnect,
        reconnect,
    };
}
