"use client";

import {
    Code2,
    Rocket,
    Share2,
    Settings,
    ChevronDown,
    Sparkles,
    GitBranch,
    Shield,
    Activity,
    Bot,
    Eye,
    Home,
    LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsAPI } from "@/lib/api/projects";

const SWITCH_PROJECT_LIMIT = 8;

interface WorkspaceHeaderProps {
    projectId?: string;
    projectName?: string;
    repoUrl?: string | null;
    onOpenSettings?: () => void;
    isBuilding?: boolean;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
    onDeploy?: () => void;
    onShare?: () => void;
}

export function WorkspaceHeader({
    projectId,
    projectName = "Untitled Project",
    repoUrl,
    onOpenSettings,
    isBuilding = false,
    activeTab = "ideal",
    onTabChange,
    onDeploy,
    onShare,
}: WorkspaceHeaderProps) {
    const router = useRouter();
    const [switchOpen, setSwitchOpen] = useState(false);

    // Fetched only once the Switch Project submenu is opened.
    const otherProjects = useQuery({
        queryKey: ["projects", "switcher"],
        queryFn: async () => {
            const res = await projectsAPI.list({ page: 1, limit: SWITCH_PROJECT_LIMIT + 1 });
            if (res.error || !res.data) throw new Error(res.error ?? "Couldn't load projects");
            return res.data.projects;
        },
        enabled: switchOpen,
        staleTime: 30_000,
    });
    const switchable = (otherProjects.data ?? [])
        .filter((p) => p.id !== projectId)
        .slice(0, SWITCH_PROJECT_LIMIT);

    return (
        <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card/50 backdrop-blur-sm">
            {/* Left section - Project info */}
            <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="flex items-center gap-2">
                    <div className="flex aspect-square size-8 min-w-8 min-h-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                        <Image width={86} height={86} src="/images/logo.png" alt="Autogenix Logo" className="size-8 object-contain" />
                    </div>
                    <span className="font-bold text-lg tracking-tight hidden sm:block">
                        Auto<span className="text-primary">genix</span>
                    </span>
                </div>

                <div className="h-6 w-px bg-border hidden sm:block" />

                {/* Project name dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 font-medium max-w-50"
                        >
                            <span className="truncate">{projectName}</span>
                            <ChevronDown className="h-4 w-4 opacity-60" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onSelect={() => onOpenSettings?.()}>
                            <Settings className="h-4 w-4 mr-2" />
                            Project Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={!repoUrl}
                            onSelect={() => {
                                if (repoUrl) window.open(repoUrl, "_blank", "noopener,noreferrer");
                            }}
                        >
                            <GitBranch className="h-4 w-4 mr-2" />
                            <span className="flex-1">View Repository</span>
                            {!repoUrl && (
                                <span className="text-[10px] text-muted-foreground">Available after deploy</span>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub open={switchOpen} onOpenChange={setSwitchOpen}>
                            <DropdownMenuSubTrigger>Switch Project</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-2rem)]">
                                {otherProjects.isLoading ? (
                                    <div className="space-y-2 p-2">
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-4/5" />
                                        <Skeleton className="h-4 w-3/5" />
                                    </div>
                                ) : otherProjects.isError ? (
                                    <DropdownMenuItem disabled>Couldn&apos;t load projects</DropdownMenuItem>
                                ) : switchable.length === 0 ? (
                                    <DropdownMenuItem disabled>No other projects</DropdownMenuItem>
                                ) : (
                                    switchable.map((p) => (
                                        <DropdownMenuItem
                                            key={p.id}
                                            onSelect={() => router.push(`/project/${p.id}`)}
                                        >
                                            <span className="truncate">{p.name}</span>
                                        </DropdownMenuItem>
                                    ))
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => router.push("/home/projects")}>
                                    <LayoutDashboard className="h-4 w-4 mr-2" />
                                    All projects
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => router.push("/home")}>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    New project
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    </DropdownMenuContent>
                </DropdownMenu>


            </div>

            {/* Center section - View tabs */}
            <div className="hidden md:flex">
                <Tabs value={activeTab} onValueChange={onTabChange}>
                    <TabsList className="bg-muted/50 h-9">
                        <TabsTrigger value="idle" className="gap-1.5 text-xs px-3">
                            <LayoutDashboard className="h-3.5 w-3.5" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="code" className="gap-1.5 text-xs px-3">
                            <Code2 className="h-3.5 w-3.5" />
                            Code
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="gap-1.5 text-xs px-3">
                            <Settings className="h-3.5 w-3.5" />
                            Settings
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Right section - Actions */}
            <div className="flex items-center gap-2">
                {/* Build status badge */}
                {isBuilding && (
                    <Badge variant="secondary" className="gap-1.5 animate-pulse">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                        </span>
                        Building...
                    </Badge>
                )}

                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={onShare}
                >
                    <Share2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Share</span>
                </Button>


            </div>
        </header>
    );
}
