"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useActionState,
  ReactNode,
} from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const projectSchema = z.object({
  name:        z.string().min(1, "Project name is required").max(100, "Max 100 characters"),
  summary:     z.string().max(500, "Max 500 characters").optional(),
  description: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  errors: Partial<Record<keyof ProjectFormData, string>>;
  success: boolean;
}

const initialState: FormState = { errors: {}, success: false };

// ─── Context ──────────────────────────────────────────────────────────────────

interface ProjectDialogContextValue {
  open:  () => void;
  close: () => void;
}

const ProjectDialogContext = createContext<ProjectDialogContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectDialog() {
  const ctx = useContext(ProjectDialogContext);
  if (!ctx) throw new Error("useProjectDialog must be used within ProjectDialogProvider");
  return ctx;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const CubeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const BacklogIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const PriorityIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="2"  y="15" width="4" height="6" rx="1" opacity="0.4" />
    <rect x="9"  y="10" width="4" height="11" rx="1" opacity="0.4" />
    <rect x="16" y="4"  width="4" height="17" rx="1" opacity="0.4" />
  </svg>
);

const LeadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const MembersIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="9"  cy="8" r="3.5" />
    <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    <circle cx="18" cy="8" r="3" />
    <path d="M22 20c0-3-2.5-5-5.5-5" />
  </svg>
);

const StartIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8"  y1="2" x2="8"  y2="6" />
    <line x1="3"  y1="10" x2="21" y2="10" />
  </svg>
);

const TargetIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2"  x2="16" y2="6" />
    <line x1="8"  y1="2"  x2="8"  y2="6" />
    <line x1="3"  y1="10" x2="21" y2="10" />
    <path d="M8 14l2.5 2.5L16 11" />
  </svg>
);

const LabelsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const DependenciesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

// ─── Chips config ─────────────────────────────────────────────────────────────

const CHIPS = [
  { key: "backlog",      label: "Backlog",      Icon: BacklogIcon,      accent: "text-orange-400" },
  { key: "priority",     label: "No priority",  Icon: PriorityIcon,     accent: "text-muted-foreground" },
  { key: "lead",         label: "Lead",         Icon: LeadIcon,         accent: "text-muted-foreground" },
  { key: "members",      label: "Members",      Icon: MembersIcon,      accent: "text-muted-foreground" },
  { key: "start",        label: "Start",        Icon: StartIcon,        accent: "text-muted-foreground" },
  { key: "target",       label: "Target",       Icon: TargetIcon,       accent: "text-muted-foreground" },
  { key: "labels",       label: "Labels",       Icon: LabelsIcon,       accent: "text-muted-foreground" },
  { key: "dependencies", label: "Dependencies", Icon: DependenciesIcon, accent: "text-muted-foreground" },
];

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ProjectDialogProviderProps {
  children: ReactNode;
}

export function ProjectDialogProvider({ children }: ProjectDialogProviderProps) {
  const [isOpen,       setIsOpen]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const open  = useCallback(() => setIsOpen(true),  []);
  const close = useCallback(() => setIsOpen(false), []);

  // ── Form Action ─────────────────────────────────────────────────────────────

  async function formAction(_prev: FormState, formData: FormData): Promise<FormState> {
    const raw = {
      name:        formData.get("name")        as string,
      summary:     formData.get("summary")     as string,
      description: formData.get("description") as string,
    };

    const result = projectSchema.safeParse(raw);

    if (!result.success) {
      const errors: FormState["errors"] = {};
      result.error.issues.forEach((e) => {
        const field = e.path[0] as keyof ProjectFormData;
        errors[field] = e.message;
      });
      return { errors, success: false };
    }

    try {
      setIsSubmitting(true);
      // await onCreateProject(result.data);
      setIsOpen(false);
      return { errors: {}, success: true };
    } catch {
      return {
        errors: { name: "Failed to create project. Please try again." },
        success: false,
      };
    } finally {
      setIsSubmitting(false);
    }
  }

  const [state, action] = useActionState(formAction, initialState);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ProjectDialogContext.Provider value={{ open, close }}>
      {children}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[580px] bg-card  bg-zinc-900 border border-border p-0 gap-0 rounded-xl overflow-hidden shadow-2xl">

          {/* ── Breadcrumb header ── */}
          <DialogHeader className="px-6 py-3 border-b border-border flex flex-row items-center space-y-0">
            <div className="flex items-center gap-1.5">
              {/* Team badge */}
              <div className="h-[18px] w-[18px] rounded-[4px] bg-primary flex items-center justify-center text-[9px] font-bold text-white leading-none select-none shrink-0">
                N
              </div>
              <span className="text-[13px] text-muted-foreground font-medium">AUTOGENIX</span>
              <span className="text-[13px] text-muted-foreground/40 mx-0.5">›</span>
              <DialogTitle className="text-[13px] font-medium text-foreground m-0 p-0">
                New project
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* ── Form ── */}
          <form action={action} className="flex flex-col">
            <div className="px-8 pt-7 pb-2">

              {/* Cube icon button */}
              <div className="mb-5">
                <button
                  type="button"
                  className="h-10 w-10 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <CubeIcon />
                </button>
              </div>

              {/* Project name */}
              <div className="mb-1">
                <Input
                  name="name"
                  placeholder="Project name"
                  autoFocus
                  className="
                    border-none bg-transparent shadow-none ring-0
                    text-[18px] font-semibold
                    text-foreground placeholder:text-muted-foreground/90
                    placeholder:text-lg
                    focus-visible:ring-0 focus-visible:ring-offset-0
                    px-2 py-5 w-full
                  "
                />
                {state.errors.name && (
                  <p className="text-xs text-destructive mt-1">{state.errors.name}</p>
                )}
              </div>

              {/* Short summary */}
              <div className="mb-6">
                <Input
                  name="summary"
                  placeholder="Add a short summary..."
                  className="
                    border-none bg-transparent shadow-none ring-0
                    text-[16px] text-muted-foreground placeholder:text-muted-foreground/90
                    placeholder:text-lg
                    focus-visible:ring-0 focus-visible:ring-offset-0
                    px-2 py-6 w-full
                  "
                />
                {state.errors.summary && (
                  <p className="text-xs text-destructive mt-1">{state.errors.summary}</p>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-border mb-5" />

              {/* Description textarea — tall + wide for professional feel */}
              <Textarea
                name="description"
                placeholder="Write a description, a project brief, or collect ideas..."
                rows={10}
                className="
                  border-none bg-transparent shadow-none resize-none ring-0
                  text-[14px] leading-7
                  text-foreground placeholder:text-muted-foreground/25
                  focus-visible:ring-0 focus-visible:ring-offset-0
                  px-0 w-full scrollbar-none
                "
              />
              {state.errors.description && (
                <p className="text-xs text-destructive mt-1">{state.errors.description}</p>
              )}
            </div>

            {/* Milestones row */}
            <div className="mx-8 mt-4 mb-6 rounded-lg border border-border bg-card flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-muted-foreground">Milestones</span>
              <button
                type="button"
                className="text-muted-foreground/40 hover:text-muted-foreground text-xl leading-none transition-colors flex items-center justify-center w-5 h-5"
              >
                +
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-8 py-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={close}
                className="h-8 px-4 rounded-lg text-[13px] font-medium text-muted-foreground border border-border hover:bg-accent hover:text-accent-foreground transition-all"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="
                  h-8 px-5 rounded-lg text-[13px] font-semibold
                  bg-primary hover:bg-primary/90 text-primary-foreground
                  shadow-sm transition-all duration-150
                  hover:scale-[1.02] active:scale-[0.98]
                  disabled:opacity-50 disabled:pointer-events-none
                "
              >
                {isSubmitting ? "Creating..." : "Create project"}
              </Button>
            </div>

          </form>
        </DialogContent>
      </Dialog>
    </ProjectDialogContext.Provider>
  );
}