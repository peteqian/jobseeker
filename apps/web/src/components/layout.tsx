import {
  AlertCircle,
  BriefcaseBusiness,
  ChevronLeft,
  Compass,
  Files,
  FileText,
  LayoutGrid,
  MessageSquare,
  Plus,
  Radar,
  Settings,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { projectRouteId } from "@/lib/project-route";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { ShellHeaderProvider, useShellHeaderContext } from "@/providers/shell-header-context";

const primaryNavigation = [
  { to: "/projects", label: "Projects", icon: Workflow },
  { to: "/documents", label: "Documents", icon: Files },
  { to: "/activity", label: "Activity", icon: Radar },
] as const;

const projectSteps = [
  { segment: "", label: "Overview", icon: LayoutGrid },
  { segment: "/resume", label: "Your resume", icon: Upload },
  { segment: "/coach", label: "Coach", icon: MessageSquare },
  { segment: "/profile", label: "Profile", icon: Sparkles },
  { segment: "/explorer", label: "Explorer", icon: Compass },
  { segment: "/tailoring", label: "Tailoring", icon: FileText },
] as const;

export function AppLayout() {
  return (
    <ShellHeaderProvider>
      <AppLayoutInner />
    </ShellHeaderProvider>
  );
}

function AppLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { meta: shellHeaderMeta } = useShellHeaderContext();
  const { projects, error, clearError, createProject, busyAction } = useJobseeker();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const createProjectForm = useForm({
    defaultValues: {
      projectTitle: "",
    },
    onSubmit: async ({ value }) => {
      if (!value.projectTitle.trim()) {
        return;
      }

      const project = await createProject(value.projectTitle.trim());
      createProjectForm.reset();
      setCreateDialogOpen(false);
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: projectRouteId(project) },
      });
    },
  });

  const projectMatch = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/);
    if (!match) return null;

    return projects.find((item) => projectRouteId(item) === match[1]) ?? null;
  }, [location.pathname, projects]);

  const isProjectRoute = projectMatch !== null;
  const isProjectIndexRoute = /^\/projects\/?$/.test(location.pathname);

  const pageMeta = useMemo(() => {
    if (shellHeaderMeta) {
      return shellHeaderMeta;
    }

    if (projectMatch) {
      return {
        title: projectMatch.project.title,
        description:
          "Open this project to continue the job search flow from intake through tailoring.",
      };
    }

    if (location.pathname.startsWith("/projects")) {
      return {
        title: "Projects",
        description: "Open a project to start, continue, or resume a job search flow.",
      };
    }

    return {
      title: "Projects",
      description: "Open a project to start, continue, or resume a job search flow.",
    };
  }, [shellHeaderMeta, projectMatch, location.pathname]);

  return (
    <SidebarProvider defaultOpen className="h-svh overflow-hidden">
      <Sidebar className="bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="w-full">
          <div className="flex items-center gap-3">
            <BriefcaseBusiness />
            <p>JobSeeker</p>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {isProjectRoute && projectMatch ? (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Project</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        type="button"
                        isActive={false}
                        onClick={() => void navigate({ to: "/projects" })}
                      >
                        <ChevronLeft className="mt-0.5 size-4" />
                        <div className="font-medium">All projects</div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {projectSteps.map((step) => {
                      const Icon = step.icon;
                      const fullPath = `/projects/${projectRouteId(projectMatch)}${step.segment}`;
                      const active =
                        step.segment === ""
                          ? location.pathname === `/projects/${projectRouteId(projectMatch)}` ||
                            location.pathname === `/projects/${projectRouteId(projectMatch)}/`
                          : location.pathname.startsWith(fullPath);

                      return (
                        <SidebarMenuItem key={step.segment}>
                          <SidebarMenuButton
                            type="button"
                            isActive={active}
                            onClick={() =>
                              void navigate({
                                to: `/projects/$projectId${step.segment}` as string,
                                params: {
                                  projectId: projectRouteId(projectMatch),
                                },
                              })
                            }
                          >
                            <Icon className="mt-0.5 size-4" />
                            <div className="font-medium">{step.label}</div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {projects.length > 0 ? (
                <SidebarGroup>
                  <SidebarGroupLabel>Projects</SidebarGroupLabel>
                  <SidebarGroupAction
                    aria-label="Create project"
                    title="Create project"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="size-4" />
                  </SidebarGroupAction>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {projects.map((project) => (
                        <SidebarMenuItem key={project.project.id}>
                          <SidebarMenuButton
                            type="button"
                            isActive={projectRouteId(projectMatch) === projectRouteId(project)}
                            onClick={() =>
                              void navigate({
                                to: "/projects/$projectId",
                                params: { projectId: projectRouteId(project) },
                              })
                            }
                          >
                            <Workflow className="mt-0.5 size-4" />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{project.project.title}</div>
                            </div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}
            </>
          ) : (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {primaryNavigation.map((item) => {
                      const Icon = item.icon;
                      const active = location.pathname.startsWith(item.to);

                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            type="button"
                            isActive={active}
                            onClick={() => void navigate({ to: item.to })}
                          >
                            <Icon className="mt-0.5 size-4" />
                            <div>
                              <div className="font-medium">{item.label}</div>
                            </div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {isProjectIndexRoute || projects.length > 0 ? (
                <SidebarGroup>
                  <SidebarGroupLabel>Projects</SidebarGroupLabel>
                  <SidebarGroupAction
                    aria-label="Create project"
                    title="Create project"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="size-4" />
                  </SidebarGroupAction>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {projects.map((project) => (
                        <SidebarMenuItem key={project.project.id}>
                          <SidebarMenuButton
                            type="button"
                            isActive={false}
                            onClick={() =>
                              void navigate({
                                to: "/projects/$projectId",
                                params: { projectId: projectRouteId(project) },
                              })
                            }
                          >
                            <Workflow className="mt-0.5 size-4" />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{project.project.title}</div>
                            </div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}
            </>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                isActive={location.pathname.startsWith("/settings")}
                onClick={() => void navigate({ to: "/settings" })}
              >
                <Settings className="mt-0.5 size-4" />
                <div className="font-medium">Settings</div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 h-full overflow-hidden">
        <header className="z-10 shrink-0 bg-background">
          <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8 lg:py-2.5">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div>
                <p className="text-sm font-semibold tracking-tight">{pageMeta.title}</p>
                <p className="text-sm text-muted-foreground">{pageMeta.description}</p>
              </div>
            </div>

            {pageMeta.action ?? null}

            {isProjectIndexRoute ? (
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="size-4" />
                Create project
              </Button>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 lg:px-6 lg:py-5">
          {error ? (
            <Alert className="mb-6 border-0 bg-destructive/10 text-destructive shadow-sm">
              <AlertCircle className="size-4" />
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button variant="ghost" size="sm" onClick={clearError}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </SidebarInset>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Start a new role-specific project to track jobs, answers, and resume tailoring.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void createProjectForm.handleSubmit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="project-title">Role or search title</Label>
              <createProjectForm.Field name="projectTitle">
                {(field) => (
                  <Input
                    id="project-title"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Senior product engineer"
                    autoFocus
                  />
                )}
              </createProjectForm.Field>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  createProjectForm.reset();
                  setCreateDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <createProjectForm.Subscribe selector={(state) => state.values.projectTitle}>
                {(projectTitle) => (
                  <Button
                    type="submit"
                    disabled={busyAction === "create-project" || projectTitle.trim().length === 0}
                  >
                    {busyAction === "create-project" ? "Creating project..." : "Create project"}
                  </Button>
                )}
              </createProjectForm.Subscribe>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
