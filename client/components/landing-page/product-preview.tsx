import { Bot } from "lucide-react";
import Image from "next/image";

export function ProductPreview() {
    return (
        <div className="relative z-10 px-4 pb-24 sm:pb-32">
            <div className="max-w-7xl mx-auto">
                <div className="relative">
                    {/* Soft glow — small radius, no heavy blur */}
                    <div className="absolute -inset-3 bg-primary/5 rounded-3xl blur-xl" />

                    <div className="relative rounded-2xl border border-border/60 bg-card/60 overflow-hidden shadow-xl">
                        {/* Window chrome */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-card/80">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                            </div>
                            <div className="flex-1 flex justify-center">
                                <div className="px-4 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground font-mono">
                                    autogenix.dev/workspace
                                </div>
                            </div>
                            <div className="w-14" />
                        </div>

                        {/* IMAGE PLACEHOLDER — replace with actual product screenshot */}
                        <div className="relative w-full aspect-video bg-linear-to-br from-background via-card to-muted/30 flex items-center justify-center">
                            
                            <Image fill className="object-cover" src="/images/preview.png" alt="Product preview" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
