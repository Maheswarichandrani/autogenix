import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, Plus , Info, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { projectsAPI } from "@/lib/api";

const ProjectsPage = async () => {

  try {

    const session = await auth();
    const response = await projectsAPI.list({ page: 1, limit: 10 });
    const data = response.data;

    if (!data) {
      throw new Error("Failed to fetch projects");
    }

    return (
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{session?.user?.name}&apos;s projects</h1>
          </div>
          <div className="flex gap-2">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New project
            </Button>
          </div>
        </div>

        {/* Stats Cards - Real data from projects */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Total Projects</span>
                  <Info className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold">{data?.total || 0}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Total Builds</span>
                  <Info className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold">
                  {0}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Successful Builds</span>
                  <Info className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold">
                  {0}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Active Projects</span>
                  <Info className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold">
                  {data?.total}
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Project metrics updated in real-time. Statistics include all builds and deployments across your projects.
            </p>
          </div>
        </Card>

        {/* Projects Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">{data?.total || 0} Project{(data?.total || 0) !== 1 ? 's' : ''}</h2>
          
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-8" />
            </div>
          </div>

          {/* Projects Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Framework</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Info</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Deployed Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.projects?.length > 0 ? (
                data?.projects.map((project) => (
                  <TableRow key={project.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/project/${project.id}`} className="flex items-center gap-2 w-full">
                        <div className="w-6 h-6 bg-primary rounded-sm flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {project.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{project.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{project.description || ''}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/project/${project.id}`} className="block w-full">
                        <Badge variant="outline" className="text-xs">
                          {project.stack?.framework || 'Unknown'}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/project/${project.id}`} className="block w-full">
                        <Badge 
                          variant={
                            project.status === 'active' ? 'default' :
                            project.status === 'deleted' ? 'destructive' :
                            'outline'
                          }
                          className="text-xs"
                        >
                          {project.status}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/project/${project.id}`} className="block w-full">
                        <div className="text-sm text-muted-foreground">
                          —
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/project/${project.id}`} className="block w-full">
                        <div className="text-sm text-muted-foreground">
                          {new Date(project.updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                          <div className="text-xs">
                            {new Date(project.updated_at).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between">
                        {!project.latest_deploy_url && (
                          <Link href={`/project/${project.id}`} className="flex-1">
                            <span className="text-xs text-muted-foreground">Not deployed</span>
                          </Link>
                        )}
                        {project.latest_deploy_url && (
                            <Link
                              href={project.latest_deploy_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2"
                            >
                              <ExternalLink className="h-4 w-4" />
                              View Live
                            </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No projects found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data?.projects && data.projects.length > 0 && (
            <div className="flex items-center justify-between px-2 py-4 w-full">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#" isActive>
                      1
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#">
                      2
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#">
                      3
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>
    );

  } catch (error) {
    console.error("Error fetching projects:", error);
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-bold">Projects</h1>
        <p className="text-red-500">Failed to load projects</p>
      </div>
    );
  }
};

export default ProjectsPage;
