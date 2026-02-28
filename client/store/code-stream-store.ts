"use client";

/**
 * store/code-stream-store.ts
 *
 * Zustand store for the code panel's live file stream.
 *
 * Receives file_created / file_deleted events from a SEPARATE SSE connection
 * (project:{id}:code Redis channel) and maintains the file tree + open tabs.
 *
 * Architecture:
 *   - Completely independent from the workflow-store (chat stream)
 *   - PreviewSidebar reads from this store for its file tree and editor state
 *   - useCodeStream hook connects the EventSource → this store
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { FileNode, EditorTab } from "@/components/code-editor/types";
import { getLanguageFromFileName } from "@/components/code-editor/types";

// ─── Code stream event types ──────────────────────────────────────────────────

export type CodeStreamEvent =
    | { type: "file_created"; path: string; content: string; lines: number; size: number }
    | { type: "file_deleted"; path: string }
    | { type: "close_stream" }
    | { type: "error"; message: string };

// ─── Store interface ──────────────────────────────────────────────────────────

interface CodeStreamStore {
    /** Flat list of all files received (path → content) */
    fileMap: Map<string, { content: string; lines: number; size: number }>;

    /** Tree structure for FileExplorer */
    fileTree: FileNode[];

    /** Open tabs in the editor */
    openTabs: EditorTab[];

    /** Currently active tab ID */
    activeTabId: string | null;

    /** Whether a code stream is currently connected */
    isConnected: boolean;

    /** Total files received in current session */
    fileCount: number;

    // ── Actions ──────────────────────────────────────────────────────────────

    /** Handle an incoming code stream SSE event */
    handleCodeEvent: (event: CodeStreamEvent) => void;

    /** Set connection status */
    setConnected: (connected: boolean) => void;

    /** Reset all state (on project change or unmount) */
    reset: () => void;

    /** Open a specific file by its path-based ID */
    openFile: (fileId: string) => void;

    /** Close a tab */
    closeTab: (tabId: string) => void;

    /** Set active tab */
    setActiveTab: (tabId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a flat file path (e.g. "src/models/user.py") into a FileNode ID.
 * Uses the path itself as the ID for simplicity.
 */
function pathToId(path: string): string {
    return path.replace(/\\/g, "/");
}

/**
 * Build a tree of FileNodes from a flat map of file paths.
 * Folders are inferred from path segments.
 */
function buildFileTree(fileMap: Map<string, { content: string; lines: number; size: number }>): FileNode[] {
    const root: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();

    // Sort paths so parent folders are processed before children
    const sortedPaths = Array.from(fileMap.keys()).sort();

    for (const filePath of sortedPaths) {
        const normalised = pathToId(filePath);
        const segments = normalised.split("/");
        const fileName = segments.pop()!;

        // Ensure all parent folders exist
        let currentChildren = root;
        let currentPath = "";

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;

            let folder = folderMap.get(currentPath);
            if (!folder) {
                folder = {
                    id: currentPath,
                    name: segment,
                    type: "folder",
                    children: [],
                    isExpanded: true,   // Auto-expand new folders
                };
                folderMap.set(currentPath, folder);
                currentChildren.push(folder);
            }
            currentChildren = folder.children!;
        }

        // Add the file node
        const fileData = fileMap.get(filePath)!;
        const fileNode: FileNode = {
            id: normalised,
            name: fileName,
            type: "file",
            content: fileData.content,
            language: getLanguageFromFileName(fileName),
        };

        // Replace if file already exists (updated via re-write)
        const existingIndex = currentChildren.findIndex((n) => n.id === normalised);
        if (existingIndex >= 0) {
            currentChildren[existingIndex] = fileNode;
        } else {
            currentChildren.push(fileNode);
        }
    }

    return root;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE = {
    fileMap: new Map() as Map<string, { content: string; lines: number; size: number }>,
    fileTree: [] as FileNode[],
    openTabs: [] as EditorTab[],
    activeTabId: null as string | null,
    isConnected: false,
    fileCount: 0,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCodeStreamStore = create<CodeStreamStore>()(
    devtools(
        (set, get) => ({
            ...INITIAL_STATE,

            handleCodeEvent: (event: CodeStreamEvent) => {
                if (process.env.NODE_ENV === "development") {
                    console.log("[CodeStream] event:", event.type, event);
                }

                switch (event.type) {
                    case "file_created": {
                        const { path, content, lines, size } = event;
                        const fileId = pathToId(path);

                        set((s) => {
                            // Update the flat map
                            const newMap = new Map(s.fileMap);
                            newMap.set(path, { content, lines, size });

                            // Rebuild tree from the map
                            const newTree = buildFileTree(newMap);

                            // Update any open tab with this file's new content
                            const updatedTabs = s.openTabs.map((tab) =>
                                tab.id === fileId
                                    ? { ...tab, content, language: getLanguageFromFileName(tab.name) }
                                    : tab
                            );

                            // Auto-open the first file, or if it's already in tabs
                            let newActiveTabId = s.activeTabId;
                            const isFirstFile = s.fileMap.size === 0;

                            if (isFirstFile || !s.activeTabId) {
                                // Auto-open the first file
                                const fileName = path.split("/").pop()!;
                                const existsInTabs = updatedTabs.some((t) => t.id === fileId);

                                if (!existsInTabs) {
                                    updatedTabs.push({
                                        id: fileId,
                                        name: fileName,
                                        content,
                                        language: getLanguageFromFileName(fileName),
                                        isDirty: false,
                                    });
                                }
                                newActiveTabId = fileId;
                            }

                            return {
                                fileMap: newMap,
                                fileTree: newTree,
                                openTabs: updatedTabs,
                                activeTabId: newActiveTabId,
                                fileCount: newMap.size,
                            };
                        });
                        break;
                    }

                    case "file_deleted": {
                        const { path } = event;
                        const fileId = pathToId(path);

                        set((s) => {
                            const newMap = new Map(s.fileMap);
                            newMap.delete(path);

                            const newTree = buildFileTree(newMap);

                            // Close tab if it was open
                            const newTabs = s.openTabs.filter((t) => t.id !== fileId);
                            let newActiveTabId = s.activeTabId;

                            if (s.activeTabId === fileId) {
                                newActiveTabId = newTabs.length > 0 ? newTabs[0].id : null;
                            }

                            return {
                                fileMap: newMap,
                                fileTree: newTree,
                                openTabs: newTabs,
                                activeTabId: newActiveTabId,
                                fileCount: newMap.size,
                            };
                        });
                        break;
                    }

                    case "close_stream":
                        if (process.env.NODE_ENV === "development") {
                            console.log("[CodeStream] Task complete — SSE stays open");
                        }
                        // SSE is persistent — don't touch isConnected.
                        // Files stay visible; connection stays alive for the next build.
                        break;

                    case "error":
                        console.error("[CodeStream] Error:", event.message);
                        break;
                }
            },

            setConnected: (connected: boolean) => {
                set({ isConnected: connected });
            },

            reset: () => {
                set({
                    ...INITIAL_STATE,
                    fileMap: new Map(),  // new reference
                });
            },

            openFile: (fileId: string) => {
                const state = get();
                const existingTab = state.openTabs.find((t) => t.id === fileId);

                if (existingTab) {
                    set({ activeTabId: fileId });
                    return;
                }

                // Find the file in the tree
                const findNode = (nodes: FileNode[]): FileNode | null => {
                    for (const node of nodes) {
                        if (node.id === fileId) return node;
                        if (node.children) {
                            const found = findNode(node.children);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const file = findNode(state.fileTree);
                if (!file || file.type !== "file") return;

                const newTab: EditorTab = {
                    id: file.id,
                    name: file.name,
                    content: file.content || "",
                    language: file.language || getLanguageFromFileName(file.name),
                    isDirty: false,
                };

                set((s) => ({
                    openTabs: [...s.openTabs, newTab],
                    activeTabId: fileId,
                }));
            },

            closeTab: (tabId: string) => {
                set((s) => {
                    const newTabs = s.openTabs.filter((t) => t.id !== tabId);
                    let newActiveTabId = s.activeTabId;

                    if (s.activeTabId === tabId) {
                        const closedIndex = s.openTabs.findIndex((t) => t.id === tabId);
                        const newIndex = Math.min(closedIndex, newTabs.length - 1);
                        newActiveTabId = newTabs.length > 0 ? newTabs[newIndex].id : null;
                    }

                    return { openTabs: newTabs, activeTabId: newActiveTabId };
                });
            },

            setActiveTab: (tabId: string) => {
                set({ activeTabId: tabId });
            },
        }),
        { name: "code-stream-store" }
    )
);

// ─── Selector hooks ───────────────────────────────────────────────────────────

export const useCodeFileTree = () => useCodeStreamStore((s) => s.fileTree);
export const useCodeOpenTabs = () => useCodeStreamStore((s) => s.openTabs);
export const useCodeActiveTab = () => useCodeStreamStore((s) => s.activeTabId);
export const useCodeFileCount = () => useCodeStreamStore((s) => s.fileCount);
export const useCodeConnected = () => useCodeStreamStore((s) => s.isConnected);
