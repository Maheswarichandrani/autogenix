"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    ArrowRight,
    Sparkles,
    Bot,
    Zap,
    Shield,
    Activity,
    ChevronRight,
} from "lucide-react";
import { useState } from "react";

export function HeroHeader() {
    const [prompt, setPrompt] = useState("");

    return (
        <div className="relative z-10 flex flex-col items-center justify-center px-4 pt-28 pb-16 sm:pt-36 sm:pb-24 min-h-screen">
            <div className="max-w-5xl mx-auto w-full flex flex-col items-center text-center">
                {/* Announcement badge */}
                <Badge
                    variant="secondary"
                    className="mb-6 px-4 py-1.5 gap-2 border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
                >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">
                        Introducing Autogenix — Now in Beta
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-primary" />
                </Badge>

                {/* Heading */}
                <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.05] max-w-5xl">
                    <span className="block">The autonomous</span>
                    <span className="hero-gradient-text block mt-1">software factory</span>
                </h1>

                {/* Subheading */}
                <p className="mt-6 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
                    Talk to it like a CTO. Autogenix builds, ships, secures, and monitors
                    your software — completely autonomously — using a swarm of specialized AI agents.
                </p>

                {/* CTA prompt bar */}
                <div className="mt-10 w-full max-w-2xl">
                    <div className="relative group">
                        <div className="absolute -inset-px rounded-2xl bg-primary/20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 blur-sm transition-opacity duration-300" />
                        <div className="relative bg-card/80 border border-border rounded-2xl p-1.5 shadow-xl">
                            <div className="flex flex-col sm:flex-row gap-1.5">
                                <div className="flex-1 relative">
                                    <Bot className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/60" />
                                    <Input
                                        placeholder="Build me a production-ready REST API for a fintech app..."
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        className="border-0 bg-background/60 pl-10 h-12 text-base focus-visible:ring-1 focus-visible:ring-primary/50 rounded-xl"
                                    />
                                </div>
                                <Button
                                    size="lg"
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-6 gap-2 font-semibold rounded-xl transition-colors"
                                >
                                    Start building
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Prompt suggestions */}
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground/70">
                        <span>Try:</span>
                        {[
                            "REST API with auth & rate limiting",
                            "E-commerce microservice",
                            "Real-time chat backend",
                        ].map((s) => (
                            <button
                                key={s}
                                onClick={() => setPrompt(s)}
                                className="px-3 py-1 rounded-full border border-border/60 bg-card/40 hover:bg-card/80 hover:border-primary/30 hover:text-foreground transition-colors cursor-pointer"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Trust bar */}
                <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        <span>Deploy in minutes</span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-border" />
                    <div className="hidden sm:flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span>Enterprise-grade security</span>
                    </div>
                    <div className="hidden md:block w-px h-4 bg-border" />
                    <div className="hidden md:flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <span>24/7 autonomous monitoring</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
