import { AppSidebar } from "@/components/home/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Shared by every project page, so the sidebar (and whether it is open)
 * survives switching projects. Closed by default; the header toggle opens it.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar collapsible="offcanvas" />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}
