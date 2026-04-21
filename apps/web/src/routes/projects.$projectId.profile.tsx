import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useModelChoice } from "@/hooks/use-model-choice";
import { getResumeDoc } from "@/lib/project";
import { projectRouteId } from "@/lib/project-route";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeaderActions, useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import { ProfileEditor, type ProfileEditorHandle } from "./projects.$projectId.profile/-editor";
import { ProfileModelSettings } from "./projects.$projectId.profile/-model-settings";

export const Route = createFileRoute("/projects/$projectId/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { project } = useProject();
  const { busyAction, startTask } = useJobseeker();
  const resumeDoc = getResumeDoc(project);
  const profile = project.profile;
  const [currentProfile, setCurrentProfile] = useState(profile);
  const projectSlug = projectRouteId(project);
  const isRebuilding = busyAction === "resume-ingest";
  const editorRef = useRef<ProfileEditorHandle>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const {
    providers,
    selection: modelSelection,
    setSelection: setModelSelection,
  } = useModelChoice(project.project.id, "profile");

  useEffect(() => {
    setCurrentProfile(profile);
  }, [profile]);

  const rebuild = useCallback(
    () =>
      void startTask(
        { projectId: project.project.id, type: "resume_ingest", modelSelection },
        "resume-ingest",
      ),
    [modelSelection, project.project.id, startTask],
  );

  useShellHeaderMeta({
    title: "Profile",
    description: "Builds upon your active resume and coach interaction.",
  });

  const headerActions = useMemo(() => {
    if (!resumeDoc) return null;

    return (
      <div className="flex items-center gap-2">
        <ProfileModelSettings
          providers={providers}
          selection={modelSelection}
          onSelectionChange={setModelSelection}
        />
        <Button type="button" size="sm" variant="outline" onClick={rebuild} disabled={isRebuilding}>
          <RefreshCw className={`size-4 ${isRebuilding ? "animate-spin" : ""}`} />
          {isRebuilding ? "Building..." : currentProfile ? "Rebuild" : "Build"}
        </Button>
        {currentProfile ? (
          <Button
            type="button"
            size="sm"
            variant={editorDirty ? "default" : "ghost"}
            onClick={() => void editorRef.current?.save()}
            disabled={editorSaving || !editorDirty}
          >
            {editorSaving ? "Saving..." : "Save"}
          </Button>
        ) : null}
      </div>
    );
  }, [
    editorDirty,
    editorSaving,
    isRebuilding,
    modelSelection,
    currentProfile,
    providers,
    rebuild,
    resumeDoc,
    setModelSelection,
  ]);

  const shellHeaderActions = useShellHeaderActions(headerActions);

  if (!resumeDoc) {
    return (
      <>
        {shellHeaderActions}
        <div className="h-full overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>No resume yet</CardTitle>
              <CardDescription>
                Upload your resume first so we can start building your profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to="/projects/$projectId/resume"
                params={{ projectId: projectSlug }}
                className={buttonVariants()}
              >
                Add your resume
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!currentProfile) {
    return (
      <>
        {shellHeaderActions}
        <div className="h-full overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Build your profile</CardTitle>
              <CardDescription>
                Click Build above to read your resume and coach answers, then generate a structured
                profile you can edit.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {shellHeaderActions}
      <div className="h-full overflow-y-auto">
        <ProfileEditor
          ref={editorRef}
          projectId={project.project.id}
          initialProfile={currentProfile}
          onDirtyChange={setEditorDirty}
          onSavingChange={setEditorSaving}
          onSaved={setCurrentProfile}
        />
      </div>
    </>
  );
}
