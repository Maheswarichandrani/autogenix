"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronRight,
    ChevronDown,
    File,
    Folder,
    FolderOpen,
    Search,
    RefreshCw,
} from "lucide-react";
import { VscCollapseAll } from "react-icons/vsc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    FileNode,
    FileExplorerProps,
    fileIconColors,
} from "./types";

// File icon component based on extension
function FileIcon({ fileName }: { fileName: string }) {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const colorClass = fileIconColors[ext] || "text-muted-foreground";

    return <File className={cn("h-4 w-4 shrink-0", colorClass)} />;
}

// Single file/folder item
function FileTreeItem({
    node,
    depth,
    selectedFileId,
    onFileSelect,
    onToggleFolder,
}: {
    node: FileNode;
    depth: number;
    selectedFileId: string | null;
    onFileSelect: (file: FileNode) => void;
    onToggleFolder: (folderId: string) => void;
}) {
    const isSelected = selectedFileId === node.id;
    const isFolder = node.type === "folder";
    const isExpanded = node.isExpanded;

    const handleClick = () => {
        if (isFolder) {
            onToggleFolder(node.id);
        } else {
            onFileSelect(node);
        }
    };

    return (
        <div>
            <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                    "group flex items-center gap-1 px-2 py-1 cursor-pointer rounded-sm transition-colors",
                    "hover:bg-sidebar-accent/50",
                    isSelected && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleClick}
            >
                {/* Expand/collapse icon for folders */}
                {isFolder ? (
                    <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                        {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                    </span>
                ) : (
                    <span className="w-4" />
                )}

                {/* Icon */}
                {isFolder ? (
                    isExpanded ? (
                        <FolderOpen className="h-4 w-4 shrink-0 text-primary/80" />
                    ) : (
                        <Folder className="h-4 w-4 shrink-0 text-primary/60" />
                    )
                ) : (
                    <FileIcon fileName={node.name} />
                )}

                {/* Name */}
                <span className="truncate text-sm">{node.name}</span>
            </motion.div>

            {/* Children (for folders) */}
            <AnimatePresence>
                {isFolder && isExpanded && node.children && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        {node.children.map((child) => (
                            <FileTreeItem
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                selectedFileId={selectedFileId}
                                onFileSelect={onFileSelect}
                                onToggleFolder={onToggleFolder}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Main file explorer component
export function FileExplorer({
    files,
    selectedFileId,
    onFileSelect,
    onToggleFolder,
    onCollapseAll,
}: FileExplorerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    // Filter files based on search query
    const filterFiles = (nodes: FileNode[], query: string): FileNode[] => {
        if (!query.trim()) return nodes;

        return nodes.reduce<FileNode[]>((acc, node) => {
            if (node.type === "folder" && node.children) {
                const filteredChildren = filterFiles(node.children, query);
                if (filteredChildren.length > 0) {
                    acc.push({ ...node, children: filteredChildren, isExpanded: true });
                }
            } else if (
                node.name.toLowerCase().includes(query.toLowerCase())
            ) {
                acc.push(node);
            }
            return acc;
        }, []);
    };

    const filteredFiles = filterFiles(files, searchQuery);

    return (
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
            {/* Header */}
            <div className="flex items-center justify-between h-10 px-3 border-b border-sidebar-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                    Explorer
                </span>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Collapse All"
                        onClick={onCollapseAll}
                    >
                        <VscCollapseAll className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="px-2 py-2">
                <div
                    className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md bg-input/50 border border-transparent transition-colors",
                        isSearchFocused && "border-primary/50 bg-input"
                    )}
                >
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                    />
                </div>
            </div>

            {/* File tree */}
            <div className="flex-1 overflow-auto scrollbar-thin py-1">
                {filteredFiles.length > 0 ? (
                    filteredFiles.map((node) => (
                        <FileTreeItem
                            key={node.id}
                            node={node}
                            depth={0}
                            selectedFileId={selectedFileId}
                            onFileSelect={onFileSelect}
                            onToggleFolder={onToggleFolder}
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/60">
                        <File className="h-8 w-8 mb-2" />
                        <span className="text-xs">No files found</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-sidebar-border">
                <span className="text-[10px] text-muted-foreground/50">
                    {files.length} items
                </span>
            </div>
        </div>
    );
}
