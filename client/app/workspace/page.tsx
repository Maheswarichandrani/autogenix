"use client";

import { useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TaskPanel } from "@/components/workspace/task-panel";
import { PreviewSidebar } from "@/components/workspace/preview-sidebar";
import { WorkspacePromptInput } from "@/components/workspace/workspace-prompt-input";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles,
    Loader2,
    Code2,
    Image as ImageIcon,
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Chat messages for the center panel
interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    attachments?: string[];
    artifacts?: Artifact[];
}

// Build artifacts
interface Artifact {
    id: string;
    type: "image" | "code" | "file";
    title: string;
    preview?: string;
}

// Sample chat messages for demo
const sampleMessages: ChatMessage[] = [
    {
        id: "1",
        role: "user",
        content:
            "Build me a production-ready REST API for a fintech app with auth, rate limiting, and monitoring.",
        timestamp: new Date(Date.now() - 300000),
    },
    {
        id: "2",
        role: "assistant",
        content:
            "I'll spin up the agent factory to build your fintech REST API. Let me coordinate the squads:\n\n**SpectraCode** is breaking down your requirements and setting up the project structure.\n\n**ThreatNest** will run security audits once we have the initial implementation.\n\n**OpsOrchestra** is preparing CI/CD pipelines.\n\nStarting with the authentication system first...",
        timestamp: new Date(Date.now() - 290000),
        artifacts: [
            {
                id: "a1",
                type: "code",
                title: "auth/middleware.ts",
                preview: "JWT authentication middleware",
            },
        ],
    },
    {
        id: "3",
        role: "system",
        content: "SpectraCode completed: Project scaffolding with Express.js + TypeScript",
        timestamp: new Date(Date.now() - 280000),
    },
];

// Chat message component
function ChatMessageItem({ message }: { message: ChatMessage }) {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";

    if (isSystem) {
        return (
            <div className="flex items-center justify-center py-2">
                <Badge variant="secondary" className="text-xs font-normal">
                    {message.content}
                </Badge>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex gap-3 py-4",
                isUser ? "flex-row-reverse" : "flex-row"
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                    isUser ? "bg-primary/10" : "bg-primary"
                )}
            >
                {isUser ? (
                    <span className="text-xs font-semibold text-primary">U</span>
                ) : (
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                )}
            </div>

            {/* Message content */}
            <div
                className={cn(
                    "flex flex-col max-w-[80%] space-y-2",
                    isUser ? "items-end" : "items-start"
                )}
            >
                <div
                    className={cn(
                        "px-4 py-3 rounded-2xl text-sm",
                        isUser
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted/50 text-foreground rounded-tl-sm"
                    )}
                >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Artifacts */}
                {message.artifacts && message.artifacts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {message.artifacts.map((artifact) => (
                            <div
                                key={artifact.id}
                                className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                                {artifact.type === "code" && (
                                    <Code2 className="h-4 w-4 text-blue-500" />
                                )}
                                {artifact.type === "image" && (
                                    <ImageIcon className="h-4 w-4 text-green-500" />
                                )}
                                {artifact.type === "file" && (
                                    <FileText className="h-4 w-4 text-orange-500" />
                                )}
                                <div>
                                    <div className="font-medium">{artifact.title}</div>
                                    {artifact.preview && (
                                        <div className="text-muted-foreground">{artifact.preview}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                <span className="text-[10px] text-muted-foreground px-1">
                    {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
            </div>
        </div>
    );
}

// Main workspace page
export default function WorkspacePage() {
    const [isBuilding, setIsBuilding] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);

    const handlePromptSubmit = (prompt: string, attachments?: File[]) => {
        const newMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: prompt,
            timestamp: new Date(),
            attachments: attachments?.map((f) => f.name),
        };
        setMessages((prev) => [...prev, newMessage]);
        setIsBuilding(true);

        // Simulate assistant response
        setTimeout(() => {
            const response: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content:
                    "Got it! I'm analyzing your request and coordinating the agent squads. Let me break this down into actionable tasks...",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, response]);
            setIsBuilding(false);
        }, 1500);
    };

    return (
        <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
            {/* Header */}
            {/* Mock page: the real workspace header needs a project and the sidebar provider */}
            <header className="flex h-14 items-center border-b border-border px-4 font-medium">
                Fintech API
            </header>

            {/* Main content with resizable panels — fixed height = screen minus header */}
            <div style={{ height: "calc(100vh - 56px)" }}>
                <Group orientation="horizontal" className="h-full">
                    {/* Left Panel - Task List */}
                    {/* Center Panel - Chat/Conversation */}
                    <Panel defaultSize={50} minSize={50} className="scrollbar-hide">
                        <div className="h-full flex flex-col overflow-hidden scrollbar-hide bg-background">
                            {/* Chat messages — use native overflow instead of ScrollArea */}
                            <div className="flex-1 overflow-x-hidden scrollbar-hide px-4">
                                <div className="max-w-3xl mx-auto  py-4">
                                    {messages.map((message) => (
                                        <ChatMessageItem key={message.id} message={message} />
                                    ))}

                                    {/* Typing indicator when building */}
                                    {isBuilding && (
                                        <div className="flex items-center gap-3 py-4">
                                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                                                <Sparkles className="h-4 w-4 text-primary-foreground" />
                                            </div>
                                            <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 rounded-2xl rounded-tl-sm">
                                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                <span className="text-sm text-muted-foreground">
                                                    AutogenixAgent is coordinating...
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Prompt input — always pinned at bottom */}
                            <div className="shrink-0 p-4 border-t border-border bg-card/30">
                                <div className="max-w-3xl mx-auto">
                                    <WorkspacePromptInput
                                        onSubmit={handlePromptSubmit}
                                        isProcessing={isBuilding}
                                        placeholder="Ask Autogenix to build, modify, or explain..."
                                    />
                                </div>
                            </div>
                        </div>
                    </Panel>
                    <Separator className="w-2 bg-border" />
                    <Panel
                        defaultSize={30} minSize={20}
                    >
                        {/* <TaskPanel
                            currentFile="tailwind.config.ts"
                            currentAction="Setting up design system components in parallel"
                        /> */}
                    </Panel>

                    {/* Handle between left and center */}



                </Group>
            </div>
        </div>
    );
}
