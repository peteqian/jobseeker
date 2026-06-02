import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { saveProjectProfile } from "@/lib/api";
import { projectsKeys } from "@/lib/query-keys";
import type { ProfileSkill, ProjectSnapshot, StructuredProfile } from "@jobseeker/contracts";

import { CompanyPreferencesSection } from "./-components/company-preferences-section";
import { JsonEditor } from "./-components/json-editor";
import { InsightsTier } from "./-components/insights-tier";
import { PreferredLocationsSection } from "./-components/preferred-locations-section";
import { ProjectsSection } from "./-components/projects-section";
import { SkillsSection } from "./-components/skills-section";
import { SummarySection } from "./-components/summary-section";
import { type EditableProfile, toEditableProfile, toStructuredProfile } from "./-components/types";
import { WorkHistorySection } from "./-components/work-history-section";
import { WorkRightsSection } from "./-components/work-rights-section";

export interface ProfileEditorHandle {
  save: () => Promise<void>;
}

export interface ProfileEditorProps {
  projectId: string;
  initialProfile: StructuredProfile;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onSaved?: (profile: StructuredProfile) => void;
}

export const ProfileEditor = forwardRef<ProfileEditorHandle, ProfileEditorProps>(
  function ProfileEditor(
    { projectId, initialProfile, onDirtyChange, onSavingChange, onSaved },
    ref,
  ) {
    const initialProfileToken = `${initialProfile.version}:${initialProfile.updatedAt}`;
    const initialEditorProfile = useMemo(() => toEditableProfile(initialProfile), [initialProfile]);
    const queryClient = useQueryClient();
    const [skillDraft, setSkillDraft] = useState("");
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [savedSerializedProfile, setSavedSerializedProfile] = useState(() =>
      JSON.stringify(initialProfile),
    );
    const saveProfileMutation = useMutation({
      mutationFn: (profile: StructuredProfile) => saveProjectProfile(projectId, profile),
      onSuccess: (snapshot) => {
        queryClient.setQueryData(projectsKeys.detail(projectId), snapshot);
        queryClient.setQueryData<ProjectSnapshot[]>(
          projectsKeys.list(),
          (current) =>
            current?.map((project) =>
              project.project.id === snapshot.project.id ? snapshot : project,
            ) ?? current,
        );
      },
    });

    const form = useForm({
      defaultValues: initialEditorProfile,
      onSubmit: async ({ value }) => {
        const nextProfilePayload: StructuredProfile = {
          ...toStructuredProfile(value),
          version: value.version + 1,
          updatedAt: new Date().toISOString(),
        };
        const snapshot = await saveProfileMutation.mutateAsync(nextProfilePayload);
        const savedProfile = snapshot.profile;

        if (!savedProfile) {
          throw new Error("Saved profile missing from project snapshot");
        }

        setSavedSerializedProfile(JSON.stringify(savedProfile));
        setLastSaved(new Date());
        form.reset(toEditableProfile(savedProfile));
        onSaved?.(savedProfile);
      },
    });

    const formRef = useRef(form);
    formRef.current = form;

    const loadedProfileTokenRef = useRef(initialProfileToken);
    useEffect(() => {
      if (loadedProfileTokenRef.current === initialProfileToken) {
        return;
      }

      loadedProfileTokenRef.current = initialProfileToken;
      setSavedSerializedProfile(JSON.stringify(initialProfile));
      formRef.current.reset(toEditableProfile(initialProfile));
      setSkillDraft("");
    }, [initialProfile, initialProfileToken]);

    const serializedProfile = useStore(form.store, (state) =>
      JSON.stringify(toStructuredProfile(state.values as EditableProfile)),
    );
    const isSaving = useStore(form.store, (state) => state.isSubmitting);
    const searchKeywords = useStore(
      form.store,
      (state) => state.values.searchContext.effectiveKeywords,
    );
    const discoveredPreferences = useStore(
      form.store,
      (state) => state.values.memory.discoveredPreferences,
    );
    const clarifications = useStore(form.store, (state) => state.values.memory.clarifications);
    const skills = useStore(form.store, (state) => state.values.skills);
    const isDirty = serializedProfile !== savedSerializedProfile;

    useEffect(() => {
      onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useEffect(() => {
      onSavingChange?.(isSaving);
    }, [isSaving, onSavingChange]);

    const saveProfile = async () => {
      await form.handleSubmit();
    };

    const saveRef = useRef(saveProfile);
    saveRef.current = saveProfile;
    useImperativeHandle(ref, () => ({ save: () => saveRef.current() }), []);

    const addSkill = (name: string, category: ProfileSkill["category"] = "technical") => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (skills.some((skill) => skill.name.toLowerCase() === trimmed.toLowerCase())) return;

      form.setFieldValue("skills", (prev) => [...prev, { name: trimmed, category }]);
    };

    return (
      <form
        className="flex h-full min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <Tabs defaultValue="background" className="flex h-full min-h-0 flex-col gap-0">
          <div className="shrink-0 border-b">
            <div className="mx-auto max-w-3xl px-1 py-3">
              <TabsList>
                <TabsTrigger value="background">Background</TabsTrigger>
                <TabsTrigger value="targeting">Targeting</TabsTrigger>
                <TabsTrigger value="insights">AI insights</TabsTrigger>
                <TabsTrigger value="json">Raw JSON</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-6 px-1 pb-16 pt-6">
              <TabsContent value="background" className="space-y-6">
                <SummarySection form={form} />
                <SkillsSection
                  form={form}
                  skillDraft={skillDraft}
                  setSkillDraft={setSkillDraft}
                  addSkill={addSkill}
                />
                <WorkHistorySection form={form} />
                <ProjectsSection form={form} />
              </TabsContent>

              <TabsContent value="targeting" className="space-y-6">
                <PreferredLocationsSection form={form} />
                <WorkRightsSection form={form} />
                <CompanyPreferencesSection form={form} />
              </TabsContent>

              <TabsContent value="insights">
                <InsightsTier
                  searchKeywords={searchKeywords}
                  discoveredPreferences={discoveredPreferences}
                  clarifications={clarifications}
                />
              </TabsContent>

              <TabsContent value="json">
                <JsonEditor form={form} />
              </TabsContent>

              {lastSaved ? (
                <p className="text-center text-sm text-muted-foreground">
                  Last saved {lastSaved.toLocaleTimeString()}
                </p>
              ) : null}
            </div>
          </div>
        </Tabs>
      </form>
    );
  },
);
