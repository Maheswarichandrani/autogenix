"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileCode } from "lucide-react";
import { DeployCard } from "./deploy-card";

interface ArtifactCardProps {
  artifactType: string;
  title: string;
  content: unknown;
}

const DEPLOY_CARD_TYPES = new Set(["env_var_request", "connect_railway"]);

export function ArtifactCard({ artifactType, title, content }: ArtifactCardProps) {
  if (DEPLOY_CARD_TYPES.has(artifactType)) {
    return <DeployCard title={title} content={content} />;
  }

  // Generic artifact display for every other type
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="size-4 text-primary" />
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {artifactType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
          {JSON.stringify(content, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
