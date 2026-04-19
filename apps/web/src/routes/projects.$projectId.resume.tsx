import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import type { ResumeVersion } from "@jobseeker/contracts";

export const Route = createFileRoute("/projects/$projectId/resume")({
  component: ResumePage,
});

function ResumePage() {
  const { project } = useProject();
  const {
    busyAction,
    uploadResume,
    pasteResume,
    switchActiveResume,
    deleteResume,
    getResumeVersionsForProject,
  } = useJobseeker();

  const layoutRef = useRef<HTMLDivElement | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"paste" | "upload">("paste");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const shellHeader = useMemo(
    () => ({
      title: "Your resume",
      description: "Upload, switch, and inspect the resume source that powers this project.",
    }),
    [],
  );

  useShellHeaderMeta(shellHeader);

  const isBusy =
    busyAction === "upload-resume" ||
    busyAction === "paste-resume" ||
    busyAction === "switch-resume" ||
    busyAction === "delete-resume";
  const canSubmit = dialogMode === "paste" ? resumeText.trim().length > 0 : Boolean(resumeFile);

  function resetDialog() {
    setResumeText("");
    setResumeFile(null);
    setDialogMode("paste");
  }

  async function handleDialogSubmit() {
    if (dialogMode === "upload") {
      if (!resumeFile) {
        return;
      }

      await uploadResume(project.project.id, resumeFile);
    } else {
      if (!resumeText.trim()) {
        return;
      }

      await pasteResume(project.project.id, {
        text: resumeText,
        name: `${project.project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-resume.md`,
      });
    }

    const nextVersions = await refreshVersions();
    const nextActive = nextVersions.find((version) => version.isActive) ?? nextVersions[0] ?? null;

    setSelectedId(nextActive?.document.id ?? null);
    resetDialog();
    setDialogOpen(false);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setDialogOpen(nextOpen);

    if (!nextOpen) {
      resetDialog();
    }
  }

  useEffect(() => {
    let active = true;

    getResumeVersionsForProject(project.project.id)
      .then((result) => {
        if (active) {
          setVersions(result);
        }
      })
      .catch(() => {
        if (active) {
          setVersions([]);
        }
      });

    return () => {
      active = false;
    };
  }, [project.project.id, project.documents.length, getResumeVersionsForProject]);

  useEffect(() => {
    if (!versions.length) {
      setSelectedId(null);
      return;
    }

    const hasSelected = versions.some((version) => version.document.id === selectedId);
    if (hasSelected) {
      return;
    }

    const activeVersion = versions.find((version) => version.isActive) ?? versions[0];
    setSelectedId(activeVersion.document.id);
  }, [selectedId, versions]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const bounds = layoutRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextWidth = event.clientX - bounds.left;
      setLeftWidth(clamp(nextWidth, 280, 520));
    };

    const onUp = () => {
      setIsResizing(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const activeVersion = versions.find((version) => version.isActive) ?? null;
  const selectedVersion =
    versions.find((version) => version.document.id === selectedId) ?? activeVersion ?? null;
  const content = getContentState(selectedVersion);

  async function refreshVersions() {
    const nextVersions = await getResumeVersionsForProject(project.project.id);
    setVersions(nextVersions);
    return nextVersions;
  }

  async function handleActivate(version: ResumeVersion) {
    if (version.isActive) {
      setSelectedId(version.document.id);
      return;
    }

    await switchActiveResume(project.project.id, version.document.id);
    const nextVersions = await refreshVersions();
    const nextActive =
      nextVersions.find((item) => item.document.id === version.document.id) ??
      nextVersions.find((item) => item.isActive) ??
      null;

    setSelectedId(nextActive?.document.id ?? null);
  }

  async function handleDelete(version: ResumeVersion) {
    await deleteResume(project.project.id, version.document.id);
    const nextVersions = await refreshVersions();
    const nextSelected =
      nextVersions.find(
        (item) => item.document.id === selectedId && item.document.id !== version.document.id,
      ) ??
      nextVersions.find((item) => item.isActive) ??
      nextVersions[0] ??
      null;

    setSelectedId(nextSelected?.document.id ?? null);
  }

  return (
    <>
      <div
        ref={layoutRef}
        className="flex h-full min-h-0 overflow-hidden rounded-lg bg-card shadow-sm"
        style={{ "--resume-list-width": `${leftWidth}px` } as CSSProperties}
      >
        <div className="grid h-full min-h-0 w-full xl:[grid-template-columns:var(--resume-list-width)_0.75rem_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col bg-muted/20">
            <div className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold tracking-tight">Resume list</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a version to inspect or activate it.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{versions.length} saved</Badge>
                  <Button size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {versions.length ? (
                <div className="space-y-2">
                  {versions.map((version) => {
                    const isSelected = version.document.id === selectedVersion?.document.id;

                    return (
                      <div
                        key={version.document.id}
                        className={cn(
                          "rounded-lg px-3 py-3 transition-colors",
                          isSelected ? "bg-card shadow-sm" : "hover:bg-accent/40",
                        )}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedId(version.document.id)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }

                            event.preventDefault();
                            setSelectedId(version.document.id);
                          }}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-start gap-2">
                                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <p className="truncate font-medium">{version.document.name}</p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {version.isActive ? (
                                  <Badge variant="default" className="gap-1">
                                    <CheckCircle2 className="size-3" />
                                    Active resume
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Inactive</Badge>
                                )}
                                <span>{formatDate(version.uploadedAt)}</span>
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="self-start"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleDelete(version);
                              }}
                              disabled={isBusy}
                              aria-label={`Delete ${version.document.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            {version.isActive
                              ? "Used for matching and tailoring"
                              : "Available to activate"}
                          </p>
                          <Button
                            variant={version.isActive ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => void handleActivate(version)}
                            disabled={isBusy}
                          >
                            {version.isActive ? "Active resume" : "Set active"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-3xl bg-background/70 px-6 text-center">
                  <FileText className="size-8 text-muted-foreground" />
                  <div className="space-y-1">
                    <h4 className="font-medium">No resumes saved yet</h4>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Add a pasted resume or upload a file to create the first version.
                    </p>
                  </div>
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4" />
                    Add resume
                  </Button>
                </div>
              )}
            </div>
          </section>

          <div
            className="relative hidden cursor-col-resize select-none xl:flex xl:items-stretch"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="mx-auto w-px bg-border/70" />
            <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
              <div
                className={cn(
                  "rounded-full bg-background p-1 text-muted-foreground shadow-sm transition-colors",
                  isResizing && "bg-accent text-accent-foreground",
                )}
              >
                <GripVertical className="size-4" />
              </div>
            </div>
          </div>

          <section className="flex min-h-0 flex-col bg-background/60">
            <div className="px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold tracking-tight">{content.title}</h3>
                  <p className="text-sm text-muted-foreground">{content.description}</p>
                </div>
                {selectedVersion ? (
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {selectedVersion.document.name}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {selectedVersion ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{formatDate(selectedVersion.uploadedAt)}</span>
                    <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
                    <span>{content.meta}</span>
                  </div>

                  {content.value ? (
                    <pre className="min-h-[30rem] whitespace-pre-wrap break-words rounded-3xl bg-background/80 p-5 font-mono text-xs leading-relaxed">
                      {content.value}
                    </pre>
                  ) : (
                    <div className="flex min-h-[30rem] flex-col items-center justify-center gap-3 rounded-3xl bg-background/70 px-8 text-center">
                      <FileText className="size-8 text-muted-foreground" />
                      <div className="space-y-1">
                        <h4 className="font-medium">Text not ready</h4>
                        <p className="max-w-md text-sm leading-6 text-muted-foreground">
                          {content.empty}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[30rem] flex-col items-center justify-center gap-3 rounded-3xl bg-background/70 px-8 text-center">
                  <FileText className="size-8 text-muted-foreground" />
                  <div className="space-y-1">
                    <h4 className="font-medium">Choose a resume</h4>
                    <p className="max-w-md text-sm leading-6 text-muted-foreground">
                      Pick a saved version from the list to inspect its extracted text.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add resume</DialogTitle>
            <DialogDescription>
              Paste resume text or upload a file. PDF, DOCX, TXT, and MD uploads are converted into
              editable text automatically.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleDialogSubmit();
            }}
          >
            <Tabs
              value={dialogMode}
              onValueChange={(value) => setDialogMode(value as "paste" | "upload")}
            >
              <TabsList aria-label="Resume input mode">
                <TabsTrigger type="button" value="paste">
                  Paste content
                </TabsTrigger>
                <TabsTrigger type="button" value="upload">
                  Upload file
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" keepMounted>
                <div className="space-y-2">
                  <Label htmlFor="resume-paste">Resume text</Label>
                  <Textarea
                    id="resume-paste"
                    value={resumeText}
                    onChange={(event) => setResumeText(event.target.value)}
                    placeholder="Paste the resume contents here..."
                    className="min-h-64"
                  />
                </div>
              </TabsContent>

              <TabsContent value="upload" keepMounted>
                <div className="space-y-2">
                  <Label htmlFor="resume-upload">Resume file</Label>
                  <Input
                    id="resume-upload"
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload PDF, DOCX, TXT, or MD and the app will extract text automatically.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </form>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetDialog();
                setDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleDialogSubmit()} disabled={isBusy || !canSubmit}>
              <Upload className="size-4" />
              {isBusy ? "Adding..." : "Add resume"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function getContentState(version: ResumeVersion | null) {
  if (!version) {
    return {
      title: "Content",
      description: "Select a saved version to inspect its text.",
      value: "",
      empty: "",
      meta: "",
    };
  }

  if (version.extractedDocument?.content) {
    return {
      title: "Content",
      description: "Extracted text from the selected resume.",
      value: version.extractedDocument.content,
      empty: "",
      meta: "Extracted automatically",
    };
  }

  if (version.document.content) {
    return {
      title: "Content",
      description: "Stored text for the selected resume.",
      value: version.document.content,
      empty: "",
      meta: "Using saved source text",
    };
  }

  return {
    title: "Content",
    description: "Text will appear here when extraction finishes.",
    value: "",
    empty: "This resume is saved, but text extraction has not completed yet.",
    meta: "Waiting for extraction",
  };
}
