import WorkspaceClient from "@/components/workspace/workspace-client";
import { AppSidebar } from "@/components/home/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { projectsAPI } from "@/lib/api";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const response = await projectsAPI.getById(id);
    
    if (response.error || !response.data) {
      return {
        title: "Project | Autogenix",
        description: "AI-powered development workspace",
      };
    }

    const project = response.data;
    return {
      title: `${project.name} | Autogenix`,
      description: project.description || `Working on ${project.name} project`,
    };
  } catch (error) {
    return {
      title: "Project | Autogenix",
      description: "AI-powered development workspace",
    };
  }
}

// export const revalidate = 100000;

const ProjectPage = async ({
  params,
} : {
  params: {
    id: string;
  };
}) => {
  let hasError = false;

  try {
    const { id } = await params;
    const response = await projectsAPI.getById(id);

    if (response.error || !response.data) {
      throw new Error(response.error || "Failed to fetch project");
    }

    const project = response.data;

    return (
        // Sidebar starts closed; the header's toggle opens it off-canvas.
        <SidebarProvider defaultOpen={false}>
            <AppSidebar collapsible="offcanvas" />
            <SidebarInset className="h-screen min-w-0 overflow-hidden">
                <WorkspaceClient initialProject={project} />
            </SidebarInset>
        </SidebarProvider>
    );
  } catch (error) {
    console.error("Error fetching project:", error);
    hasError = true;
  }

  if (hasError) {
    return (
      <main>
        <h1>Project Details</h1>
        <p>Error fetching project information.</p>
      </main>
    );
  }
};

export default ProjectPage;
