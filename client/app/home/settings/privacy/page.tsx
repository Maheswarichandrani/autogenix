"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, BrainCircuit, HardDrive, Trash2, EyeOff } from "lucide-react";

const privacyItems = [
  {
    key: "aiMemory" as const,
    icon: BrainCircuit,
    title: "AI Memory",
    description: "Allow Autogenix to remember context across sessions for better responses.",
  },
  {
    key: "fileStorage" as const,
    icon: HardDrive,
    title: "Temporary File Storage",
    description: "Store uploaded files temporarily for analysis and auto-delete them later.",
  },
  {
    key: "autoDelete" as const,
    icon: Trash2,
    title: "Auto-Delete Conversations",
    description: "Automatically remove conversations after 7 days.",
  },
  {
    key: "promptRedaction" as const,
    icon: EyeOff,
    title: "Prompt Redaction",
    description: "Automatically mask sensitive information like passwords or API keys.",
  },
];

type PrivacyState = {
  aiMemory: boolean;
  fileStorage: boolean;
  autoDelete: boolean;
  promptRedaction: boolean;
};

export default function PrivacySettingsPage() {
  const [settings, setSettings] = useState<PrivacyState>({
    aiMemory: true,
    fileStorage: true,
    autoDelete: false,
    promptRedaction: true,
  });

  const toggle = (key: keyof PrivacyState) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-semibold">Privacy</h2>
          <p className="text-sm text-muted-foreground">
            Manage how Autogenix protects your data
          </p>
        </div>
      </div>

      <Card>
        <CardContent className=" px-0 pb-0">
          {privacyItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.key}>
                <div className="flex items-center justify-between px-6 py-4 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings[item.key]}
                    onCheckedChange={() => toggle(item.key)}
                    className="ml-6 shrink-0"
                  />
                </div>
                {index < privacyItems.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}