"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Github, Mail, Chrome, Code2, Puzzle } from "lucide-react";

const integrations = [
  {
    icon: Github,
    name: "GitHub",
    description: "Analyze repositories and explain code.",
    connected: true,
  },
  {
    icon: Chrome,
    name: "Google",
    description: "Access documents and study materials.",
    connected: false,
  },
  {
    icon: Code2,
    name: "Notion",
    description: "Get AI assistance directly in your editor.",
    connected: false,
  },
  {
    icon: Mail,
    name: "Mail",
    description: "Summarize and draft emails using AI.",
    connected: true,
  },
];

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Puzzle className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-semibold">Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Connect Autogenix with your development and productivity tools.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-0 px-0 pb-0">
          {integrations.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between px-5 py-4 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{item.name}</p>
                        {item.connected && (
                          <Badge variant="secondary" className="text-xs py-0">Connected</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={item.connected}
                  >
                    {item.connected ? "Manage" : "Connect"}
                  </Button>
                </div>
                {index < integrations.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}