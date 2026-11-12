import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown for the moment a project loads: the workspace's own outline (header
 * and composer), so opening a project feels like switching, not a reload.
 */
export default function Loading() {
  return (
    <div className="flex h-full flex-col bg-background" aria-busy="true" aria-label="Loading project">
      <div className="flex h-13 shrink-0 items-center gap-3 border-b border-border px-3">
        <div className="size-8" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="flex-1" />
      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-4">
        <div className="mx-auto w-full max-w-240">
          <div className="h-13.5 rounded-2xl border border-border bg-secondary" />
          <div className="mt-2 h-4" />
        </div>
      </div>
    </div>
  );
}
