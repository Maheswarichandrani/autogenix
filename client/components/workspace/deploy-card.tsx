"use client";

/**
 * deploy-card.tsx
 *
 * Renders the env_var_request / connect_railway artifacts: the human approval
 * step before the Deployer runs. The user connects Railway (only if needed),
 * enters the app's env vars (or none) and clicks Deploy.
 *
 * Secret handling: values live only in this component's state until the single
 * provide_env_vars POST, are cleared right after, and are never persisted,
 * logged or put in a URL. After submit only key names are shown.
 */

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { accountAPI } from "@/lib/api/account";
import { cn } from "@/lib/utils";
import { useWorkspaceActions } from "./workspace-actions-context";

// ── Limits (mirrored on the server in message_routes._validate_env_vars) ──────
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VARS = 50;
const MAX_VALUE_LEN = 8192;
const RAILWAY_TOKENS_URL = "https://railway.com/account/tokens";
const CREDENTIALS_QUERY_KEY = ["account", "credentials"] as const;

interface DeployCardContent {
  build_id?: string;
  status?: string;
  message?: string;
  suggested_vars?: string[];
  submitted_keys?: string[];
}

interface EnvRow {
  id: number;
  key: string;
  value: string;
  visible: boolean;
}

interface RowErrors {
  key?: string;
  value?: string;
}

interface DeployCardProps {
  title: string;
  content: unknown;
}

/** SSE delivers content as a JSON string; the history API as an object. */
function parseContent(content: unknown): DeployCardContent {
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return content && typeof content === "object" ? (content as DeployCardContent) : {};
}

function validateRows(rows: EnvRow[]): Record<number, RowErrors> {
  const errors: Record<number, RowErrors> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const e: RowErrors = {};
    const key = row.key.trim();
    if (!key) e.key = "Name is required";
    else if (!KEY_RE.test(key)) e.key = "Use letters, digits and _ only, not starting with a digit";
    else if (seen.has(key)) e.key = "Duplicate name";
    seen.add(key);
    if (!row.value) e.value = "Value is required, or remove this row";
    else if (row.value.length > MAX_VALUE_LEN) e.value = `At most ${MAX_VALUE_LEN} characters`;
    if (e.key || e.value) errors[row.id] = e;
  }
  return errors;
}

export function DeployCard({ title, content }: DeployCardProps) {
  const data = parseContent(content);
  const actions = useWorkspaceActions();
  const queryClient = useQueryClient();
  const formId = useId();

  const [rows, setRows] = useState<EnvRow[]>(() =>
    (data.suggested_vars ?? []).slice(0, MAX_VARS).map((key, i) => ({
      id: i,
      key,
      value: "",
      visible: false,
    })),
  );
  const [nextId, setNextId] = useState(rows.length);
  const [railwayToken, setRailwayToken] = useState("");
  const [railwayError, setRailwayError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, RowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "submitting" | "submitted">(
    data.status === "submitted" ? "submitted" : "idle",
  );
  const [submittedKeys, setSubmittedKeys] = useState<string[]>(data.submitted_keys ?? []);

  const isSubmitted = phase === "submitted";
  const isSubmitting = phase === "submitting";

  const credentials = useQuery({
    queryKey: CREDENTIALS_QUERY_KEY,
    queryFn: async () => {
      const res = await accountAPI.getCredentials();
      if (res.error || !res.data) throw new Error(res.error ?? "Could not check Railway");
      return res.data;
    },
    enabled: !isSubmitted,
    staleTime: 30_000,
  });
  const needsRailway = credentials.data ? !credentials.data.railway_connected : false;

  // ── Row editing ─────────────────────────────────────────────────────────────
  const updateRow = (id: number, patch: Partial<EnvRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (patch.key !== undefined || patch.value !== undefined) {
      setRowErrors((errs) => {
        if (!errs[id]) return errs;
        const next = { ...errs };
        delete next[id];
        return next;
      });
    }
  };

  const addRow = () => {
    if (rows.length >= MAX_VARS) return;
    setRows((rs) => [...rs, { id: nextId, key: "", value: "", visible: false }]);
    setNextId((n) => n + 1);
  };

  const removeRow = (id: number) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setRowErrors((errs) => {
      const next = { ...errs };
      delete next[id];
      return next;
    });
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actions || isSubmitting || isSubmitted) return;
    setFormError(null);
    setRailwayError(null);

    const errors = validateRows(rows);
    setRowErrors(errors);
    const token = railwayToken.trim();
    if (needsRailway && !token) {
      setRailwayError("Add your Railway API token to deploy");
      return;
    }
    if (Object.keys(errors).length > 0) return;

    setPhase("submitting");
    try {
      if (needsRailway) {
        const saved = await accountAPI.saveRailwayKey(token);
        if (saved.error) {
          setRailwayError(saved.error);
          setPhase("idle");
          return;
        }
        setRailwayToken("");
        queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
      }

      const vars = Object.fromEntries(rows.map((r) => [r.key.trim(), r.value]));
      await actions.sendActionAsync({ action: "provide_env_vars", vars });

      // Drop every value from memory; keep only the names for the summary.
      setSubmittedKeys(Object.keys(vars).sort());
      setRows([]);
      setPhase("submitted");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not start the deploy");
      setPhase("idle");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const description = isSubmitted
    ? "Deployment approved. Progress continues below."
    : data.message ??
      "Built and security-tested. Add the environment variables your app needs, or deploy without any.";

  const status = isSubmitted
    ? { label: "Submitted", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
    : isSubmitting
      ? { label: "Deploying…", className: "border-primary/30 bg-primary/10 text-primary" }
      : { label: "Waiting for you", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" };

  return (
    <Card className="gap-0 overflow-hidden border-primary/20 py-0 shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <CardHeader className="flex flex-row items-start gap-3 px-4 py-4 sm:px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {isSubmitted ? <CheckCircle2 className="size-4" /> : <Rocket className="size-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold leading-none">{title}</h3>
            <Badge variant="outline" className={cn("text-[11px] font-medium", status.className)}>
              {status.label}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </CardHeader>

      <Separator />

      {isSubmitted ? (
        /* ── Submitted summary: key names only, never values ──────────── */
        <CardContent className="space-y-2 px-4 py-4 sm:px-5">
          <p className="text-xs text-muted-foreground">
            {submittedKeys.length === 0
              ? "Deploying without environment variables."
              : `Deploying with ${submittedKeys.length} ${submittedKeys.length === 1 ? "variable" : "variables"}.`}
          </p>
          {submittedKeys.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {submittedKeys.map((k) => (
                <Badge key={k} variant="secondary" className="font-mono text-[11px] font-normal">
                  {k}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      ) : (
        <form id={formId} onSubmit={handleSubmit} noValidate autoComplete="off">
          {/* ── Railway ─────────────────────────────────────────────── */}
          <CardContent className="space-y-3 px-4 py-4 sm:px-5">
            <SectionLabel>Railway</SectionLabel>
            {credentials.isLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : credentials.isError ? (
              <p className="text-xs text-muted-foreground">
                Couldn&apos;t check your Railway connection. You can still deploy; you&apos;ll be asked
                for a token if it&apos;s missing.
              </p>
            ) : needsRailway ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-railway`} className="text-xs">
                  API token
                </Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={`${formId}-railway`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste your Railway API token"
                    value={railwayToken}
                    onChange={(e) => {
                      setRailwayToken(e.target.value);
                      setRailwayError(null);
                    }}
                    disabled={isSubmitting}
                    aria-invalid={!!railwayError}
                    className="h-9 pl-8 font-mono text-xs"
                  />
                </div>
                {railwayError ? (
                  <FieldError>{railwayError}</FieldError>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Saved once and encrypted on our server.{" "}
                    <a
                      href={RAILWAY_TOKENS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Create a token
                      <ExternalLink className="size-3" />
                    </a>
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>Railway connected</span>
              </div>
            )}
          </CardContent>

          <Separator />

          {/* ── Environment variables ───────────────────────────────── */}
          <CardContent className="space-y-3 px-4 py-4 sm:px-5">
            <SectionLabel>Environment variables</SectionLabel>

            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variables added. Add one if your app reads secrets or connection strings.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto] gap-2 text-[11px] font-medium text-muted-foreground sm:grid">
                  <span>Name</span>
                  <span>Value</span>
                </div>
                {rows.map((row) => (
                  <EnvVarRow
                    key={row.id}
                    row={row}
                    errors={rowErrors[row.id]}
                    disabled={isSubmitting}
                    onChange={(patch) => updateRow(row.id, patch)}
                    onRemove={() => removeRow(row.id)}
                  />
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addRow}
              disabled={isSubmitting || rows.length >= MAX_VARS}
              className="-ml-2 h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Add variable
            </Button>

            {formError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="size-4" />
                <AlertDescription className="text-xs">{formError}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <CardFooter className="flex flex-col items-stretch gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Lock className="mt-0.5 size-3 shrink-0" />
              Values are encrypted before they&apos;re queued and never shown to the AI agents.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={!actions || isSubmitting || credentials.isLoading}
              className="shrink-0"
            >
              {isSubmitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Rocket className="size-3.5" />
              )}
              {isSubmitting ? "Deploying…" : rows.length === 0 ? "Deploy without variables" : "Deploy"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-destructive">{children}</p>;
}

interface EnvVarRowProps {
  row: EnvRow;
  errors?: RowErrors;
  disabled: boolean;
  onChange: (patch: Partial<EnvRow>) => void;
  onRemove: () => void;
}

function EnvVarRow({ row, errors, disabled, onChange, onRemove }: EnvVarRowProps) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto]">
        <Input
          aria-label="Variable name"
          placeholder="NAME"
          autoComplete="off"
          spellCheck={false}
          value={row.key}
          onChange={(e) => onChange({ key: e.target.value })}
          disabled={disabled}
          aria-invalid={!!errors?.key}
          className="col-span-3 h-9 font-mono text-xs sm:col-span-1"
        />
        <Input
          aria-label={`Value for ${row.key || "variable"}`}
          type={row.visible ? "text" : "password"}
          placeholder="value"
          autoComplete="off"
          spellCheck={false}
          value={row.value}
          onChange={(e) => onChange({ value: e.target.value })}
          disabled={disabled}
          aria-invalid={!!errors?.value}
          className="h-9 font-mono text-xs"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange({ visible: !row.visible })}
              disabled={disabled}
              aria-label={row.visible ? "Hide value" : "Show value"}
              className="size-9 text-muted-foreground"
            >
              {row.visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{row.visible ? "Hide value" : "Show value"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              disabled={disabled}
              aria-label="Remove variable"
              className="size-9 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>
      {(errors?.key || errors?.value) && (
        <FieldError>{errors.key ?? errors.value}</FieldError>
      )}
    </div>
  );
}
