"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Code2,
    Copy,
    Download,
    Maximize2,
    Minimize2,
    MoreVertical,
    PanelLeftClose,
    PanelLeft,
    Terminal,
    Settings,
    GitBranch,
} from "lucide-react";
import { VscSplitHorizontal, VscSearch, VscSourceControl } from "react-icons/vsc";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    FileNode,
    EditorTab,
    getLanguageFromFileName,
} from "@/components/code-editor/types";
import { FileExplorer } from "@/components/code-editor/file-explorer";
import { MonacoEditorWrapper } from "@/components/code-editor/monaco-editor-wrapper";
import { EditorTabs } from "@/components/code-editor/editor-tabs";
import { samplePreviewFiles } from "@/components/code-editor/mock-data";
import { useCodeStreamStore } from "@/store/code-stream-store";

interface PreviewSidebarProps {
    files?: FileNode[];
    className?: string;
}

export function PreviewSidebar({
    files,
    className,
}: PreviewSidebarProps) {
    // ── Live code stream state ─────────────────────────────────────────────
    const liveFileTree = useCodeStreamStore((s) => s.fileTree);
    const liveOpenTabs = useCodeStreamStore((s) => s.openTabs);
    const liveActiveTab = useCodeStreamStore((s) => s.activeTabId);
    const liveFileCount = useCodeStreamStore((s) => s.fileCount);
    const openFile = useCodeStreamStore((s) => s.openFile);
    const closeTabStore = useCodeStreamStore((s) => s.closeTab);
    const setActiveTab = useCodeStreamStore((s) => s.setActiveTab);

    // Use live data if available, otherwise fall back to static/prop data
    const hasLiveData = liveFileCount > 0;

    // Local state for static fallback mode (when no live stream)
    const [staticFileTree, setStaticFileTree] = useState<FileNode[]>(files ?? samplePreviewFiles);
    const [staticOpenTabs, setStaticOpenTabs] = useState<EditorTab[]>([]);
    const [staticActiveTabId, setStaticActiveTabId] = useState<string | null>(null);
    const [staticSelectedFileId, setStaticSelectedFileId] = useState<string | null>(null);

    // Resolve which data source to use
    const fileTree = hasLiveData ? liveFileTree : staticFileTree;
    const openTabs = hasLiveData ? liveOpenTabs : staticOpenTabs;
    const activeTabId = hasLiveData ? liveActiveTab : staticActiveTabId;
    const selectedFileId = hasLiveData ? liveActiveTab : staticSelectedFileId;

    // UI state
    const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Get current content for editor
    const currentTab = useMemo(
        () => openTabs.find((tab) => tab.id === activeTabId),
        [openTabs, activeTabId]
    );

    // Find file content recursively
    const findFile = (nodes: FileNode[], id: string): FileNode | null => {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findFile(node.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    // Handle file selection
    const handleFileSelect = useCallback(
        (file: FileNode) => {
            if (file.type !== "file") return;

            if (hasLiveData) {
                // In live mode, delegate to the store
                openFile(file.id);
                return;
            }

            // Static mode — manage local state
            setStaticSelectedFileId(file.id);

            const existingTab = staticOpenTabs.find((tab) => tab.id === file.id);

            if (existingTab) {
                setStaticActiveTabId(file.id);
            } else {
                const newTab: EditorTab = {
                    id: file.id,
                    name: file.name,
                    content: file.content || "",
                    language:
                        file.language || getLanguageFromFileName(file.name),
                    isDirty: false,
                };

                setStaticOpenTabs((prev) => [...prev, newTab]);
                setStaticActiveTabId(file.id);
            }
        },
        [hasLiveData, openFile, staticOpenTabs]
    );

    // Handle folder toggle
    const handleToggleFolder = useCallback((folderId: string) => {
        const toggleFolder = (nodes: FileNode[]): FileNode[] => {
            return nodes.map((node) => {
                if (node.id === folderId) {
                    return { ...node, isExpanded: !node.isExpanded };
                }
                if (node.children) {
                    return { ...node, children: toggleFolder(node.children) };
                }
                return node;
            });
        };

        if (hasLiveData) {
            // For live data, we toggle in a local override since the store
            // rebuilds the tree on each event. This is a visual-only toggle.
            // The tree is re-expanded on next file_created event anyway.
            setStaticFileTree((prev) => toggleFolder(prev));
        } else {
            setStaticFileTree((prev) => toggleFolder(prev));
        }
    }, [hasLiveData]);

    // Handle collapse all folders
    const handleCollapseAll = useCallback(() => {
        const collapseAll = (nodes: FileNode[]): FileNode[] => {
            return nodes.map((node) => {
                if (node.type === "folder") {
                    return {
                        ...node,
                        isExpanded: false,
                        children: node.children ? collapseAll(node.children) : undefined,
                    };
                }
                return node;
            });
        };

        setStaticFileTree((prev) => collapseAll(prev));
    }, []);

    // Handle tab selection
    const handleTabSelect = useCallback((tabId: string) => {
        if (hasLiveData) {
            setActiveTab(tabId);
        } else {
            setStaticActiveTabId(tabId);
            setStaticSelectedFileId(tabId);
        }
    }, [hasLiveData, setActiveTab]);

    // Handle tab close
    const handleTabClose = useCallback(
        (tabId: string) => {
            if (hasLiveData) {
                closeTabStore(tabId);
                return;
            }

            setStaticOpenTabs((prev) => {
                const newTabs = prev.filter((tab) => tab.id !== tabId);

                if (staticActiveTabId === tabId && newTabs.length > 0) {
                    const closedIndex = prev.findIndex((tab) => tab.id === tabId);
                    const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
                    setStaticActiveTabId(newTabs[newActiveIndex].id);
                    setStaticSelectedFileId(newTabs[newActiveIndex].id);
                } else if (newTabs.length === 0) {
                    setStaticActiveTabId(null);
                    setStaticSelectedFileId(null);
                }

                return newTabs;
            });
        },
        [hasLiveData, closeTabStore, staticActiveTabId]
    );

    // Copy code to clipboard
    const handleCopyCode = useCallback(async () => {
        if (currentTab?.content) {
            await navigator.clipboard.writeText(currentTab.content);
        }
    }, [currentTab]);

    // Download file
    const handleDownload = useCallback(() => {
        if (currentTab) {
            const blob = new Blob([currentTab.content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = currentTab.name;
            a.click();
            URL.revokeObjectURL(url);
        }
    }, [currentTab]);

    return (
        <TooltipProvider>
            <div
                className={cn(
                    "flex flex-col h-full bg-[#09090b] border-l border-border overflow-hidden",
                    isFullscreen && "fixed inset-0 z-50",
                    className
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between h-10 px-3 border-b border-border/50 bg-[#18181b]">
                    <div className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Code Editor</span>
                        {currentTab && (
                            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-secondary/50">
                                {currentTab.language}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        {/* Activity bar icons */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setIsExplorerCollapsed(!isExplorerCollapsed)}
                                >
                                    {isExplorerCollapsed ? (
                                        <PanelLeft className="h-3.5 w-3.5" />
                                    ) : (
                                        <PanelLeftClose className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isExplorerCollapsed ? "Show Explorer" : "Hide Explorer"}
                            </TooltipContent>
                        </Tooltip>
                        <div className="w-px h-4 bg-border mx-1" />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleCopyCode}
                                    disabled={!currentTab}
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy Code</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleDownload}
                                    disabled={!currentTab}
                                >
                                    <Download className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download File</TooltipContent>
                        </Tooltip>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setIsFullscreen(!isFullscreen)}>
                                    {isFullscreen ? (
                                        <>
                                            <Minimize2 className="h-4 w-4 mr-2" />
                                            Exit Fullscreen
                                        </>
                                    ) : (
                                        <>
                                            <Maximize2 className="h-4 w-4 mr-2" />
                                            Fullscreen
                                        </>
                                    )}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Main content area */}
                <div className="flex-1 flex overflow-hidden">
                    {/* File Explorer */}
                    <AnimatePresence>
                        {!isExplorerCollapsed && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 220, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="shrink-0 overflow-hidden"
                            >
                                <FileExplorer
                                    files={fileTree}
                                    selectedFileId={selectedFileId}
                                    onFileSelect={handleFileSelect}
                                    onToggleFolder={handleToggleFolder}
                                    onCollapseAll={handleCollapseAll}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Editor area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
                        {/* Editor tabs */}
                        <EditorTabs
                            tabs={openTabs}
                            activeTabId={activeTabId}
                            onTabSelect={handleTabSelect}
                            onTabClose={handleTabClose}
                        />

                        {/* Monaco Editor */}
                        <div className="flex-1 relative">
                            {currentTab ? (
                                <MonacoEditorWrapper
                                    content={currentTab.content}
                                    language={currentTab.language}
                                    fileName={currentTab.name}
                                    readOnly={true}
                                />
                            ) : (
                                <EditorWelcomeScreen onFileSelect={() => {
                                    // Select first file as demo
                                    const firstFile = findFile(fileTree, "main-ts");
                                    if (firstFile) handleFileSelect(firstFile);
                                }} />
                            )}
                        </div>

                        {/* Status bar */}
                        <div className="h-6 px-3 flex items-center justify-between bg-[#18181b] border-t border-border/30 text-[10px] text-muted-foreground">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <GitBranch className="h-3 w-3" />
                                    main
                                </span>
                                <span>UTF-8</span>
                                {currentTab && (
                                    <span className="uppercase">{currentTab.language}</span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span>Ln 1, Col 1</span>
                                <span>Spaces: 2</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

// Welcome screen when no file is open
function EditorWelcomeScreen({ onFileSelect }: { onFileSelect: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-[#09090b] text-center px-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
            >
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
                    <div className="relative p-4 rounded-2xl bg-[#18181b] border border-border/50">
                        <Code2 className="h-12 w-12 text-primary" strokeWidth={1.5} />
                    </div>
                </div>

                <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">
                        No File Open
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                        Select a file from the explorer to view and edit its contents
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <Button
                        variant="default"
                        size="sm"
                        className="glow-cyan"
                        onClick={onFileSelect}
                    >
                        <Code2 className="h-4 w-4 mr-2" />
                        Open a File
                    </Button>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mt-2">
                        <span>Tip: Use</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border font-mono text-[10px]">
                            ⌘P
                        </kbd>
                        <span>to quick open files</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}