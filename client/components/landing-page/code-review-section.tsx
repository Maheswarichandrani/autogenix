import { ArrowRight, FileCode2 } from "lucide-react";
import Link from "next/link";

/* ── Diff line types ── */
type DiffLine = {
    left?: { num: number; code: string };
    right?: { num: number; code: string };
    type: "unchanged" | "removed" | "added" | "modified";
};

const filePath = "autogenix/src/agents/spectra/CodeAgent.ts";

const diffLines: DiffLine[] = [
    {
        type: "unchanged",
        left: { num: 1, code: `import { Agent } from '@core/Agent'` },
        right: { num: 1, code: `import { Agent } from '@core/Agent'` },
    },
    {
        type: "unchanged",
        left: { num: 2, code: `import { TaskQueue } from '@core/TaskQueue'` },
        right: { num: 2, code: `import { TaskQueue } from '@core/TaskQueue'` },
    },
    {
        type: "modified",
        left: { num: 3, code: `import { analyzeCode } from '@utils/analyze'` },
        right: { num: 3, code: `import { analyzeCode, validateOutput } from '@utils/analyze'` },
    },
    {
        type: "unchanged",
        left: { num: 4, code: `import { Logger } from '@utils/Logger'` },
        right: { num: 4, code: `import { Logger } from '@utils/Logger'` },
    },
    {
        type: "unchanged",
        left: { num: 5, code: `` },
        right: { num: 5, code: `` },
    },
    {
        type: "unchanged",
        left: { num: 6, code: `export class CodeAgent extends Agent {` },
        right: { num: 6, code: `export class CodeAgent extends Agent {` },
    },
    {
        type: "modified",
        left: { num: 7, code: `  private status: 'idle' | 'running' = 'idle'` },
        right: { num: 7, code: `  private status: AgentStatus = AgentStatus.IDLE` },
    },
    {
        type: "unchanged",
        left: { num: 8, code: `` },
        right: { num: 8, code: `` },
    },
    {
        type: "modified",
        left: { num: 9, code: `  if (!this.isReady) {` },
        right: { num: 9, code: `  if (this.status === AgentStatus.PENDING) {` },
    },
    {
        type: "unchanged",
        left: { num: 10, code: `    return TaskQueue.defer(this.id)` },
        right: { num: 10, code: `    return TaskQueue.defer(this.id)` },
    },
    {
        type: "unchanged",
        left: { num: 11, code: `  }` },
        right: { num: 11, code: `  }` },
    },
    {
        type: "unchanged",
        left: { num: 12, code: `` },
        right: { num: 12, code: `` },
    },
    {
        type: "unchanged",
        left: { num: 13, code: `  return (` },
        right: { num: 13, code: `  return (` },
    },
    {
        type: "unchanged",
        left: { num: 14, code: `    <Pipeline>` },
        right: { num: 14, code: `    <Pipeline>` },
    },
    {
        type: "modified",
        left: { num: 15, code: `      <CodeReview result={analyzeCode(output)} />` },
        right: { num: 15, code: `      <CodeReview result={analyzeCode(output)} validated={validateOutput(output)} />` },
    },
    {
        type: "unchanged",
        left: { num: 16, code: `    </Pipeline>` },
        right: { num: 16, code: `    </Pipeline>` },
    },
    {
        type: "unchanged",
        left: { num: 17, code: `  )` },
        right: { num: 17, code: `  )` },
    },
    {
        type: "unchanged",
        left: { num: 18, code: `}` },
        right: { num: 18, code: `}` },
    },
];

/* ── Syntax-highlight keywords (lightweight, no external dep) ── */
function highlightSyntax(code: string) {
    const keywords =
        /\b(import|export|from|class|extends|return|if|const|private|new)\b/g;
    const strings = /('.*?'|".*?"|`.*?`)/g;
    const types =
        /\b(Agent|TaskQueue|Logger|Pipeline|CodeReview|AgentStatus)\b/g;

    // We'll build spans via splitting — keep it simple with dangerouslySetInnerHTML
    let html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Strings first (so keywords inside strings aren't highlighted)
    html = html.replace(
        strings,
        `<span class="text-[#a5d6ff]">$1</span>`
    );
    // Types
    html = html.replace(
        types,
        `<span class="text-[#ffa657]">$1</span>`
    );
    // Keywords
    html = html.replace(
        keywords,
        `<span class="text-[#ff7b72]">$1</span>`
    );

    return html;
}

/* ── Single diff column cell ── */
function DiffCell({
    line,
}: {
    line?: { num: number; code: string };
    side: "left" | "right";
    type: DiffLine["type"];
}) {
    if (!line) return <div className="flex-1" />;

    return (
        <div className="flex items-start">
            {/* Line number */}
            <span className="w-10 shrink-0 text-right pr-3 text-muted-foreground/30 select-none text-[12px] leading-6">
                {String(line.num).padStart(2, "0")}
            </span>
            {/* Code */}
            <code
                className="flex-1 text-[12.5px] leading-6 whitespace-pre overflow-hidden text-ellipsis"
                dangerouslySetInnerHTML={{ __html: highlightSyntax(line.code) }}
            />
        </div>
    );
}

export function CodeReviewSection() {
    return (
        <div className="relative z-10 px-4 py-24 sm:py-32">
            <div className="max-w-7xl mx-auto">
                {/* ── Header — two-column split ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 mb-12">
                    {/* Left — bold heading */}
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
                        Review PRs and
                        <br />
                        agent output
                    </h2>

                    {/* Right — description + CTA */}
                    <div className="flex flex-col justify-center">
                        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg">
                            Understand code changes at a glance with structural diffs for
                            human and agent output. Review, discuss, and merge — all within
                            Autogenix.
                        </p>
                        <Link
                            href="/getting-started"
                            className="inline-flex items-center gap-2 mt-5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                        >
                            <span className="font-mono text-muted-foreground/50">4.0</span>
                            <span>Reviews (Coming soon)</span>
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </div>

                {/* ── Diff viewer panel ── */}
                <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                    {/* File header bar */}
                    <div className="flex items-center gap-2.5 px-5 py-3 border-b border-border/40 bg-card/60">
                        <FileCode2 className="h-4 w-4 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground/60 font-mono">
                            {filePath}
                        </span>
                    </div>

                    {/* Split diff — side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/30 font-mono">
                        {/* Left pane (before) */}
                        <div className="overflow-hidden">
                            {diffLines.map((line, i) => (
                                <div
                                    key={`l-${i}`}
                                    className={`px-4 ${line.type === "removed"
                                            ? "bg-red-500/8"
                                            : line.type === "modified"
                                                ? "bg-red-500/8"
                                                : ""
                                        }`}
                                >
                                    <DiffCell
                                        line={line.left}
                                        side="left"
                                        type={line.type}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Right pane (after) */}
                        <div className="overflow-hidden">
                            {diffLines.map((line, i) => (
                                <div
                                    key={`r-${i}`}
                                    className={`px-4 ${line.type === "added"
                                            ? "bg-green-500/8"
                                            : line.type === "modified"
                                                ? "bg-green-500/8"
                                                : ""
                                        }`}
                                >
                                    <DiffCell
                                        line={line.right}
                                        side="right"
                                        type={line.type}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
