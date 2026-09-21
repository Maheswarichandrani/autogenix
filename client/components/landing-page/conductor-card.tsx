import { ArrowRight, Brain, Network, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { agentSquads } from "./squad-data";

const capabilities = [
    { icon: Network, label: "Task routing", desc: "Distributes work across squads" },
    { icon: MessageSquare, label: "Conflict resolution", desc: "Mediates agent disagreements" },
    { icon: Brain, label: "Shared memory", desc: "Persists every decision made" },
];

export function ConductorCard() {
    return (
        <div className="relative z-10 px-4 pb-20 sm:pb-28">
            <div className="max-w-7xl mx-auto">
                <div className="group relative rounded-2xl border border-border/50 bg-card/30 overflow-hidden hover:border-primary/30 transition-colors duration-300">
                    <div className="relative p-6 sm:p-8">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
                            {/* Left — info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary text-primary-foreground">
                                        <Brain className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h3 className="text-xl font-bold text-foreground">
                                                AutogenixAgent
                                            </h3>
                                            <span className="text-[10px] uppercase tracking-widest text-primary font-semibold px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10">
                                                Conductor
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            The master orchestrator above all squads
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mb-6 lg:mb-0">
                                    One orchestrator sits above all squads — routing tasks, resolving
                                    conflicts between agents, maintaining a shared memory of every
                                    decision, and ensuring the entire pipeline flows from prompt to
                                    production without human intervention.
                                </p>
                            </div>

                            {/* Right — capabilities */}
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 lg:w-72 shrink-0">
                                {capabilities.map((cap) => (
                                    <div
                                        key={cap.label}
                                        className="flex items-center gap-3 p-3 rounded-lg bg-background/30 border border-border/30 hover:border-primary/20 transition-colors flex-1"
                                    >
                                        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <cap.icon className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-foreground leading-none mb-0.5">
                                                {cap.label}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground/70 leading-tight">
                                                {cap.desc}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CTA row */}
                        <div className="mt-6 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <div className="flex -space-x-1">
                                    {agentSquads.map((s) => (
                                        <div
                                            key={s.name}
                                            className="w-6 h-6 rounded-full bg-primary border-2 border-card flex items-center justify-center"
                                        >
                                            <s.icon className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                    ))}
                                </div>
                                <span>4 squads · 16 agents · 1 conductor</span>
                            </div>
                            <Link href="/get-started">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 text-sm hover:border-primary/40 hover:text-primary transition-colors"
                                >
                                    See how it works
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
