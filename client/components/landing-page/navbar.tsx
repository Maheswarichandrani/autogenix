import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Infinity } from "lucide-react";

export function Navbar() {
  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 mx-auto max-w-7xl">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <div className="flex items-center gap-2">
            <Infinity size={24} />
            <span className="font-bold text-xl">
              Autogenix
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/platform"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Platform
          </Link>
          <Link
            href="/agents"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Agents
          </Link>
          <Link
            href="/enterprise"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Enterprise
          </Link>
          <Link
            href="/docs"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </Link>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button  className="bg-foreground text-background hover:bg-foreground/80!" asChild>
            <Link href="/get-started">Get Started</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
