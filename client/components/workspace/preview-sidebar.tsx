"use client";
import { useState } from "react";
import {
    ExternalLink,
    RefreshCw,
    Smartphone,
    Monitor,
    Tablet,
    Maximize2,
    Minimize2,
    ChevronUp,
    Loader2,
    Globe,
    MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type DeviceSize = "mobile" | "tablet" | "desktop";

interface PreviewSidebarProps {
    url?: string;
    isLoading?: boolean;
    className?: string;
    onRefresh?: () => void;
    onOpenExternal?: () => void;
}

const deviceSizes: Record<DeviceSize, { width: string; icon: typeof Monitor }> =
{
    mobile: { width: "375px", icon: Smartphone },
    tablet: { width: "768px", icon: Tablet },
    desktop: { width: "100%", icon: Monitor },
};

export function PreviewSidebar({
    url = "https://localhost:3000",
    isLoading = false,
    className,
    onRefresh,
    onOpenExternal,
}: PreviewSidebarProps) {
    const [device, setDevice] = useState<DeviceSize>("desktop");
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div
            className={cn(
                "flex flex-col h-full bg-card/30 border-l border-border",
                className
            )}
        >
            {/* Preview header */}
            <div className="flex items-center justify-between h-12 px-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">
                        {isLoading ? "Getting ready..." : "Live Preview"}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Device size toggles */}
                    <div className="hidden sm:flex items-center gap-0.5 mr-2">
                        {(Object.keys(deviceSizes) as DeviceSize[]).map((size) => {
                            const Icon = deviceSizes[size].icon;
                            return (
                                <Button
                                    key={size}
                                    variant={device === size ? "secondary" : "ghost"}
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setDevice(size)}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                </Button>
                            );
                        })}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onRefresh}
                    >
                        <RefreshCw
                            className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
                        />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onOpenExternal}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setIsCollapsed(!isCollapsed)}>
                                {isCollapsed ? (
                                    <>
                                        <Maximize2 className="h-4 w-4 mr-2" />
                                        Expand Preview
                                    </>
                                ) : (
                                    <>
                                        <Minimize2 className="h-4 w-4 mr-2" />
                                        Minimize Preview
                                    </>
                                )}
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Force Refresh
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Preview content */}
            {!isCollapsed && (
                <div className="flex-1 overflow-hidden bg-background/50 p-4">
                    <div
                        className={cn(
                            "h-full mx-auto bg-card border border-border rounded-xl overflow-hidden shadow-2xl transition-all duration-300",
                            device === "mobile" && "max-w-[375px]",
                            device === "tablet" && "max-w-[768px]"
                        )}
                    >
                        {/* Browser chrome mockup */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                            {/* Traffic lights */}
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>

                            {/* URL bar */}
                            <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-background rounded-md text-xs text-muted-foreground">
                                <Globe className="h-3 w-3" />
                                <span className="truncate">{url}</span>
                            </div>
                        </div>

                        {/* Preview iframe/content area */}
                        <div className="h-[calc(100%-36px)] overflow-auto bg-card">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <span className="text-sm">Building preview...</span>
                                </div>
                            ) : (
                                <PreviewContent device={device} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Collapsed state indicator */}
            {isCollapsed && (
                <div
                    className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setIsCollapsed(false)}
                >
                    <ChevronUp className="h-6 w-6 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Expand Preview</span>
                </div>
            )}
        </div>
    );
}

// Mock preview content
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PreviewContent({ device: _device }: { device: DeviceSize }) {
    return (
        <div className="p-4 space-y-4">
            {/* Mock app sidebar */}
            <div className="flex h-[400px] border border-border rounded-lg overflow-hidden">
                {/* Sidebar */}
                <div className="w-48 bg-muted/30 border-r border-border p-3 space-y-2 hidden sm:block">
                    <div className="flex items-center gap-2 text-xs font-medium px-2 py-1.5 bg-primary/10 text-primary rounded">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Cloud
                    </div>
                    {["Overview", "Database", "Users", "Storage", "Edge Functions", "AI", "Secrets", "Logs"].map(
                        (item) => (
                            <div
                                key={item}
                                className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5 hover:bg-muted/50 rounded cursor-default"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                                {item}
                            </div>
                        )
                    )}
                </div>

                {/* Main content */}
                <div className="flex-1 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Cloud</h3>
                        <Button size="sm" variant="ghost" className="text-xs h-7">
                            Close
                        </Button>
                    </div>

                    {/* Users section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Users</span>
                            <span className="text-xs text-muted-foreground">0 Sign ups</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            View user data and configure how users sign up
                        </div>
                        <div className="flex gap-2">
                            {["Auth settings"].map((btn) => (
                                <div
                                    key={btn}
                                    className="px-2 py-1 text-[10px] bg-muted/50 rounded border border-border"
                                >
                                    {btn}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Storage section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Storage</span>
                            <span className="text-xs text-muted-foreground">3 Buckets</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Store and manage files, images, and documents
                        </div>
                        <div className="flex flex-col gap-1">
                            {["avatars", "project-files", "attachments"].map((bucket) => (
                                <div
                                    key={bucket}
                                    className="flex items-center gap-2 px-2 py-1 text-[10px] text-muted-foreground"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                                    {bucket}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Edge Functions section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Edge Functions</span>
                            <span className="text-xs text-muted-foreground">4 Functions</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Configure functions executed in your app
                        </div>
                        <div className="flex flex-col gap-1">
                            {["ai-task-suggestions", "generate-report", "send-notification"].map(
                                (fn) => (
                                    <div
                                        key={fn}
                                        className="flex items-center gap-2 px-2 py-1 text-[10px] text-muted-foreground"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        {fn}
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Project title */}
            <div className="space-y-1">
                <h2 className="text-lg font-bold">Lovable Cloud</h2>
                <p className="text-sm text-muted-foreground">
                    Describe features, get full apps. Data, hosting, auth, AI included.
                </p>
            </div>
ext-xs text-muted-foreground/60 mt-2">
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
