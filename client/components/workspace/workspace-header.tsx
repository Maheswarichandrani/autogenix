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
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
interface WorkspaceHeaderProps {
    projectName?: string;
    isBuilding?: boolean;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
    onDeploy?: () => void;
    onShare?: () => void;
}

export function WorkspaceHeader({
    projectName = "Untitled Project",
    isBuilding = false,
    activeTab = "ideal",
    onTabChange,
    onDeploy,
    onShare,
}: WorkspaceHeaderProps) {
    return (
        <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card/50 backdrop-blur-sm">
            {/* Left section - Project info */}
            <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="flex items-center gap-2">
                    <div className="flex aspect-square size-8 min-w-8 min-h-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                        <Image width={86} height={86} src="/images/logo.png" alt="Nexus AI Logo" className="size-8 object-contain" />
                    </div>
                    <span className="font-bold text-lg tracking-tight hidden sm:block">
                        Nexus<span className="text-primary">AI</span>
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
                        <DropdownMenuItem>
                            <Settings className="h-4 w-4 mr-2" />
                            Project Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <GitBranch className="h-4 w-4 mr-2" />
                            View Repository
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Switch Project</DropdownMenuItem>
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
