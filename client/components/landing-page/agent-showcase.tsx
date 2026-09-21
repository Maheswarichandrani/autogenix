import {
    ArrowRight,
    Bot,
    CheckCircle2,
    Circle,
    Code2,
    Loader2,
    MoreHorizontal,
    Search,
    Shield,
    Activity,
    Rocket,
    Terminal,
} from "lucide-react";
import Link from "next/link";

/* ── Simulated agent roster ── */
const agents = [
    { name: "SpectraCode", role: "Agent", icon: Code2, active: true },
    { name: "ThreatNest", role: "Agent", icon: Shield, active: false },
    { name: "OpsOrchestra", role: "Agent", icon: Rocket, active: false },
    { name: "ObserveIQ", role: "Agent", icon: Activity, active: false },
    { name: "AutogenixAgent", role: "Conductor", icon: Bot, active: false },
];

/* ── Feature sub-links ── */
const subFeatures = [
    { num: "3.1", label: "Agent Squads" },
    { num: "3.2", label: "Task Routing" },
    { num: "3.3", label: "Shared Memory" },
    { num: "3.4", label: "Auto Deploy" },
    { num: "3.5", label: "Live Monitoring" },
];

export function AgentShowcase() {
    return (
        <div className="relative z-10 px-4 py-24 sm:py-32">
            <div className="max-w-7xl mx-auto">
                {/* ── Header — two-column split ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 mb-10">
                    {/* Left — bold heading */}
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
                        Orchestrate work across squads and agents
                    </h2>

                    {/* Right — description + CTA */}
                    <div className="flex flex-col justify-center">
                        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg">
                            Deploy autonomous AI agent squads that work alongside your team.
                            Tackle complex projects together or delegate entire features
                            end&#8209;to&#8209;end.
                        </p>
                        <Link
                            href="/getting-started"
                            className="inline-flex items-center gap-2 mt-5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                        >
                            <span className="font-mono text-muted-foreground/50">3.0</span>
                            <span>Build</span>
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </div>

                {/* ── Showcase panel ── */}
                <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-5">
                        {/* ─── Left panel: Terminal / agent workspace (3 cols) ─── */}
                        <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-border/40 p-6 sm:p-8">
                            {/* Agent header */}
                            <div className="flex items-center gap-2.5 mb-6">
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Bot className="h-4 w-4 text-primary" />
                                </div>
                                <span className="text-sm font-semibold text-foreground">
                                    SpectraCode
                                </span>
                            </div>

                            {/* Simulated terminal messages */}
                            <div className="space-y-4 font-mono text-[13px] leading-relaxed">
                                {/* Message 1 */}
                                <p className="text-muted-foreground">
                                    <span className="text-primary/70">→</span>{" "}
                                    On it! I&apos;ve received your request.
                                </p>

                                {/* Message 2 */}
                                <p className="text-muted-foreground">
                                    <span className="text-primary/70">→</span>{" "}
                                    Kicked off a task in{" "}
                                    <span className="text-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded">
                                        autogenix/project-alpha
                                    </span>{" "}
                                    environment.
                                </p>

                                {/* Message 3 — highlighted */}
                                <p className="text-primary/80">
                                    Analyzing project structure and dependencies…
                                </p>

                                {/* Terminal command */}
                                <div className="flex items-start gap-2 text-muted-foreground/70">
                                    <Terminal className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/40" />
                                    <span className="break-all">
                                        autogenix/project-alpha${" "}
                                        <span className="text-foreground/60">
                                            rg --files -g &apos;*.ts&apos; | head -20
                                        </span>
                                    </span>
                                </div>

                                {/* File output */}
                                <div className="pl-5 text-muted-foreground/50 text-xs space-y-0.5">
                                    <p>src/api/routes.ts</p>
                                    <p>src/services/auth.ts</p>
                                    <p>src/models/user.ts</p>
                                </div>

                                {/* Locating */}
                                <p className="text-primary/80">
                                    Locating initialization logic for{" "}
                                    <span className="text-foreground/70 italic">
                                        auth_service
                                    </span>
                                </p>

                                {/* Thinking indicator */}
                                <div className="flex items-center gap-2 text-muted-foreground/60">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/50" />
                                    <span>Thinking…</span>
                                </div>
                            </div>
                        </div>

                        {/* ─── Right panel: Assign-to agent list (2 cols) ─── */}
                        <div className="lg:col-span-2 p-6 sm:p-8">
                            {/* Header row */}
                            <div className="flex items-center justify-between mb-5">
                                <div className="relative flex-1 mr-3">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                                    <div className="w-full h-8 rounded-md border border-border/40 bg-background/50 pl-8 flex items-center">
                                        <span className="text-xs text-muted-foreground/40">
                                            Assign to…
                                        </span>
                                    </div>
                                </div>
                                <button className="w-7 h-7 rounded-md border border-border/40 bg-background/50 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                                    <MoreHorizontal className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Agent list */}
                            <div className="space-y-1">
                                {agents.map((agent) => (
                                    <div
                                        key={agent.name}
                                        className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group"
                                    >
                                        <div className="w-7 h-7 rounded-full bg-card border border-border/50 flex items-center justify-center shrink-0">
                                            <agent.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                        </div>
                                        <span className="text-sm font-medium text-foreground flex-1">
                                            {agent.name}
                                        </span>
                                        {agent.role && (
                                            <span className="text-[10px] font-medium text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/40 border border-border/30">
                                                {agent.role}
                                            </span>
                                        )}
                                        {agent.active ? (
                                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                        ) : (
                                            <Circle className="h-4 w-4 text-transparent group-hover:text-muted-foreground/20 shrink-0 transition-colors" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Sub-feature links ── */}
                <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3 justify-center text-sm">
                    {subFeatures.map((f) => (
                        <span key={f.num} className="inline-flex items-center gap-2">
                            <span className="font-mono text-muted-foreground/40 text-xs">
                                {f.num}
                            </span>
                            <span className="text-muted-foreground font-medium">
                                {f.label}
                            </span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
