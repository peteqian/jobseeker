import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { resumeVersionsQueryOptions } from "@/lib/query-options";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import type { ResumeVersion } from "@jobseeker/contracts";

import { AddResumeDialog } from "./projects.$projectId.resume/-add-resume-dialog";
import { ResizeHandle } from "./projects.$projectId.resume/-resize-handle";
import { ResumeList } from "./projects.$projectId.resume/-resume-list";
import { ResumePreview } from "./projects.$projectId.resume/-resume-preview";

const EMPTY_RESUME_VERSIONS: ResumeVersion[] = [];

export const Route = createFileRoute("/projects/$projectId/resume")({
  component: ResumePage,
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ResumePage() {
  const { project } = useProject();
  const { busyAction, uploadResume, pasteResume, switchActiveResume, deleteResume } =
    useJobseeker();

  const layoutRef = useRef<HTMLDivElement | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"paste" | "upload">("paste");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const versionsQuery = useQuery(resumeVersionsQueryOptions(project.project.id));
  const versions = versionsQuery.data ?? EMPTY_RESUME_VERSIONS;
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

  async function refreshVersions() {
    const nextVersions = await versionsQuery.refetch().then((result) => result.data ?? []);
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
          <ResumeList
            versions={versions}
            selectedVersion={selectedVersion}
            isBusy={isBusy}
            onSelect={setSelectedId}
            onActivate={handleActivate}
            onDelete={handleDelete}
            onAdd={() => setDialogOpen(true)}
          />

          <ResizeHandle isResizing={isResizing} onMouseDown={() => setIsResizing(true)} />

          <ResumePreview selectedVersion={selectedVersion} />
        </div>
      </div>

      <AddResumeDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleDialogSubmit}
        dialogMode={dialogMode}
        setDialogMode={setDialogMode}
        resumeText={resumeText}
        setResumeText={setResumeText}
        resumeFile={resumeFile}
        setResumeFile={setResumeFile}
        isBusy={isBusy}
        canSubmit={canSubmit}
        onReset={resetDialog}
      />
    </>
  );
}
