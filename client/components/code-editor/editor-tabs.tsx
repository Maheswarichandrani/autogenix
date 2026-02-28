"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditorTab, fileIconColors } from "./types";

interface EditorTabsProps {
    tabs: EditorTab[];
    activeTabId: string | null;
    onTabSelect: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
}

// Get icon color based on file extension
function getIconColor(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    return fileIconColors[ext] || "text-muted-foreground";
}

export function EditorTabs({
    tabs,
    activeTabId,
    onTabSelect,
    onTabClose,
}: EditorTabsProps) {
    const tabsContainerRef = useRef<HTMLDivElement>(null);

    // Scroll active tab into view
    useEffect(() => {
        if (activeTabId && tabsContainerRef.current) {
            const activeTab = tabsContainerRef.current.querySelector(
                `[data-tab-id="${activeTabId}"]`
            );
            activeTab?.scrollIntoView({ behavior: "smooth", inline: "nearest" });
        }
    }, [activeTabId]);

    if (tabs.length === 0) {
        return null;
    }

    return (
        <div className="flex items-center h-9 bg-card border-b border-border/50 overflow-hidden">
            <div
                ref={tabsContainerRef}
                className="flex items-center overflow-x-auto scrollbar-none"
            >
                <AnimatePresence mode="popLayout">
                    {tabs.map((tab) => (
                        <motion.div
                            key={tab.id}
                            data-tab-id={tab.id}
                            layout
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                                "group flex items-center gap-2 h-9 px-3 border-r border-border/30 cursor-pointer transition-colors",
                                activeTabId === tab.id
                                    ? "bg-background border-t-2 border-t-primary"
                                    : "bg-card hover:bg-muted border-t-2 border-t-transparent"
                            )}
                            onClick={() => onTabSelect(tab.id)}
                        >
                            {/* File type indicator dot */}
                            <span
                                className={cn(
                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                    getIconColor(tab.name).replace("text-", "bg-")
                                )}
                            />

                            {/* File name */}
                            <span
                                className={cn(
                                    "text-xs whitespace-nowrap",
                                    activeTabId === tab.id
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                )}
                            >
                                {tab.name}
                            </span>

                            {/* Dirty indicator or close button */}
                            <div className="flex items-center justify-center w-4 h-4 shrink-0">
                                {tab.isDirty ? (
                                    <Circle className="h-2 w-2 fill-primary text-primary" />
                                ) : (
                                    <button
                                        className={cn(
                                            "flex items-center justify-center w-4 h-4 rounded-sm transition-all",
                                            "opacity-0 group-hover:opacity-100",
                                            "hover:bg-muted"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTabClose(tab.id);
                                        }}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
