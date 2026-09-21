"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Plus,
    ArrowUp,
    Settings2,
    Paperclip,
    Wand2,
    Globe,
    Image as ImageIcon,
    X,
    Mic,
    MicOff,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WorkspacePromptInputProps {
    onSubmit?: (prompt: string, attachments?: File[]) => void;
    isProcessing?: boolean;
    placeholder?: string;
    className?: string;
    projectId?: string; // Add projectId to construct localStorage key
}

export function WorkspacePromptInput({
    onSubmit,
    isProcessing = false,
    placeholder = "Ask Autogenix...",
    className,
    projectId,
}: WorkspacePromptInputProps) {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-populate from localStorage on mount (for new projects)
    useEffect(() => {
        if (!projectId) return;

        const storageKey = `project-${projectId}-initial-prompt`;
        const stored = localStorage.getItem(storageKey);
        
        if (stored) {
            try {
                const { prompt, autoSend, timestamp } = JSON.parse(stored);
                
                // Only auto-populate if stored within last 5 minutes (prevent stale data)
                const isRecent = Date.now() - timestamp < 5 * 60 * 1000;
                
                if (isRecent && prompt) {
                    setValue(prompt);
                }
                
                // Clear localStorage after reading (one-time use)
                localStorage.removeItem(storageKey);
            } catch (err) {
                console.error("Failed to parse initial prompt from localStorage:", err);
            }
        }
    }, [projectId, onSubmit]);

    // Auto-resize textarea based on content
    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        // Min height of ~44px (single line), max height of ~200px (about 8 lines)
        const newHeight = Math.min(Math.max(el.scrollHeight, 44), 200);
        el.style.height = `${newHeight}px`;
    }, []);

    useEffect(() => {
        autoResize();
    }, [value, autoResize]);

    const handleSubmit = () => {
        if (value.trim() && !isProcessing) {
            onSubmit?.(value.trim(), attachments);
            setValue("");
            setAttachments([]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            setAttachments((prev) => [...prev, ...Array.from(files)]);
        }
        e.target.value = "";
    };

    const removeAttachment = (index: number) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <TooltipProvider>
            <div className={cn("relative", className)}>
                {/* Attachments preview */}
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 py-2 bg-muted/30 border border-b-0 border-border rounded-t-xl">
                        {attachments.map((file, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 px-2 py-1 bg-card border border-border rounded-lg text-xs"
                            >
                                {file.type.startsWith("image/") ? (
                                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="max-w-37.5 truncate">{file.name}</span>
                                <button
                                    onClick={() => removeAttachment(index)}
                                    className="p-0.5 hover:bg-muted rounded"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Main input container */}
                <div
                    className={cn(
                        "flex flex-col bg-secondary  transition-all duration-200",
                        attachments.length > 0 ? "rounded-b-xl" : "rounded-xl",
                        isFocused && "ring-2 ring-primary/30 border-primary/50"
                    )}
                >
                    {/* Textarea */}
                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            placeholder={placeholder}
                            disabled={isProcessing}
                            className={cn(
                                "w-full resize-none bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                                "scrollbar-thin"
                            )}
                            style={{ minHeight: "44px", maxHeight: "200px" }}
                            rows={1}
                        />
                    </div>

                    {/* Bottom toolbar */}
                    <div className="flex items-center justify-between px-3 py-2 ">
                        {/* Left actions */}
                        <div className="flex items-center gap-1">
                            {/* Attach menu */}
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-lg"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>Attach files</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="start" side="top" className="w-56">
                                    <DropdownMenuItem onClick={handleAttachClick}>
                                        <Paperclip className="h-4 w-4 mr-2" />
                                        Attach file
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        Add image
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem
                                        checked={webSearchEnabled}
                                        onCheckedChange={setWebSearchEnabled}
                                    >
                                        <Globe className="h-4 w-4 mr-2" />
                                        Web search
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            
                        </div>

                        {/* Right actions */}
                        <div className="flex items-center gap-2">
                            {/* Settings */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Settings</TooltipContent>
                            </Tooltip>

                            {/* Voice recording */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={isRecording ? "destructive" : "ghost"}
                                        size="icon"
                                        className="h-8 w-8 rounded-lg"
                                        onClick={() => setIsRecording(!isRecording)}
                                    >
                                        {isRecording ? (
                                            <MicOff className="h-4 w-4" />
                                        ) : (
                                            <Mic className="h-4 w-4" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {isRecording ? "Stop recording" : "Voice input"}
                                </TooltipContent>
                            </Tooltip>

                            {/* Submit button */}
                            <Button
                                size="icon"
                                className={cn(
                                    "h-8 w-8 rounded-lg transition-all",
                                    value.trim()
                                        ? "bg-primary hover:bg-primary/90"
                                        : "bg-muted text-muted-foreground"
                                )}
                                disabled={!value.trim() || isProcessing}
                                onClick={handleSubmit}
                            >
                                {isProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ArrowUp className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                />
            </div>
        </TooltipProvider>
    );
}
