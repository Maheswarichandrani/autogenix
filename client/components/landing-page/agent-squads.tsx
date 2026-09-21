import Image from "next/image";
import { agentSquads, type Squad } from "./squad-data";

/* ── Single squad card ── */
function SquadCard({ squad, index }: { squad: Squad; index: number }) {
    return (
        <div className="group relative rounded-sm bg-card/30 overflow-hidden transition-colors duration-300">
            {/* Subtle primary glow on hover — no blur for perf */}
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-primary/10 group-hover:bg-primary/25 transition-colors duration-500" />

            <div className="relative p-6 sm:p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-sm text-primary-foreground">
                            <Image src="/images/logo.png" width={80} height={80} className="object-cover" alt="Autogenix Logo" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-foreground">
                                    {squad.name}
                                </h3>
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-2 py-0.5 rounded-full border border-border/60 bg-muted/30">
                                    {squad.label}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {squad.tagline}
                            </p>
                        </div>
                    </div>
                    <span className="text-5xl font-black text-foreground/5 select-none leading-none">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-5 max-w-lg">
                    {squad.description}
                </p>

                {/* IMAGE PLACEHOLDER — replace with squad illustration */}
                <div className="relative rounded-sm bg-background/40 overflow-hidden mb-5">
                    <div className="aspect-[2.4/1] flex items-center justify-center">
                        {/* <div className="text-center space-y-2">
                            <div className="w-11 h-11 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
                                <squad.icon className="h-5 w-5 text-primary" />
                            </div>
                            <p className="text-xs text-muted-foreground/40 font-medium">
                                {squad.name} illustration placeholder
                            </p>
                        </div> */}
                        <Image fill className="object-cover" src="/landing-page/agents1.png" alt={`${squad.name} illustration`} />

                    </div>
                </div>

                {/* Sub-agents grid */}
                <div className="grid grid-cols-2 gap-2.5">
                    {squad.agents.map((agent) => (
                        <div
                            key={agent.name}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-background/30 border border-border/30 hover:border-primary/20 transition-colors"
                        >
                            <agent.icon className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground leading-none mb-1">
                                    {agent.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground/70 leading-tight">
                                    {agent.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ── Pipeline indicator (desktop) ── */
function PipelineFlow() {
    return (
        <div className="hidden lg:flex items-center justify-center gap-0 mb-10 px-8">
            {agentSquads.map((squad, i) => (
                <div key={squad.name} className="flex items-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-card/50">
                        <div className="w-2 h-2 rounded-full bg-primary squad-pulse" />
                        <span className="text-xs font-semibold text-foreground">
                            {squad.label}
                        </span>
                    </div>
                    {i < agentSquads.length - 1 && (
                        <div className="w-14 h-px relative overflow-hidden mx-1">
                            <div className="absolute inset-0 bg-border/40" />
                            <div className="absolute inset-y-0 left-0 w-6 bg-primary/40 pipeline-flow" />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/* ── Main export ── */
export function AgentSquads() {
    return (
        <div className="relative z-10 px-4 pb-20 sm:pb-28">
            <div className="max-w-7xl mx-auto">
                {/* Section header */}
                <div className="text-center mb-14">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="h-px w-12 bg-linear-to-r from-transparent to-border" />
                        <span className="text-xs uppercase tracking-[0.25em] text-primary font-semibold">
                            Agent Architecture
                        </span>
                        <div className="h-px w-12 bg-linear-to-l from-transparent to-border" />
                    </div>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                        Four squads.{" "}
                        <span className="text-muted-foreground">One mission.</span>
                    </h2>
                    <p className="mt-4 text-muted-foreground max-w-xl mx-auto text-base sm:text-lg">
                        Each squad is a team of specialized agents that collaborate, debate,
                        and self-heal to deliver production-grade software.
                    </p>
                </div>

                <PipelineFlow />

                {/* Bento grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {agentSquads.map((squad, i) => (
                        <SquadCard key={squad.name} squad={squad} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}
