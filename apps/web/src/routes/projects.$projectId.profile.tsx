import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Briefcase, MapPin, Plus, RefreshCw, Settings2, Trash2, X } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { ProviderOption } from "@/components/chat/provider-model-picker";
import { useModelChoice } from "@/hooks/use-model-choice";
import { apiUrl } from "@/lib/api";
import { getResumeDoc } from "@/lib/project";
import { projectRouteId } from "@/lib/project-route";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeaderActions, useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import type {
  ChatModelSelection,
  ProfileExperience,
  ProfileLocation,
  ProfileSkill,
  ProfileTargetRole,
  StructuredProfile,
} from "@jobseeker/contracts";
import { PROVIDER_DISPLAY_NAMES } from "@jobseeker/contracts";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export const Route = createFileRoute("/projects/$projectId/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { project } = useProject();
  const { busyAction, startTask } = useJobseeker();
  const resumeDoc = getResumeDoc(project);
  const profile = project.profile;
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
        <Button size="sm" variant="outline" onClick={rebuild} disabled={isRebuilding}>
          <RefreshCw className={`size-4 ${isRebuilding ? "animate-spin" : ""}`} />
          {isRebuilding ? "Building..." : profile ? "Rebuild" : "Build"}
        </Button>
        {profile && (
          <Button
            size="sm"
            variant={editorDirty ? "default" : "ghost"}
            onClick={() => void editorRef.current?.save()}
            disabled={editorSaving || !editorDirty}
          >
            {editorSaving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    );
  }, [
    editorDirty,
    editorSaving,
    isRebuilding,
    modelSelection,
    profile,
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

  if (!profile) {
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
          initialProfile={profile}
          onDirtyChange={setEditorDirty}
          onSavingChange={setEditorSaving}
        />
      </div>
    </>
  );
}

interface ProfileEditorHandle {
  save: () => Promise<void>;
}

interface ProfileEditorProps {
  projectId: string;
  initialProfile: StructuredProfile;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
}

const ProfileEditor = forwardRef<ProfileEditorHandle, ProfileEditorProps>(function ProfileEditor(
  { projectId, initialProfile, onDirtyChange, onSavingChange },
  ref,
) {
  const [profile, setProfile] = useState<StructuredProfile>(initialProfile);
  const [savedProfile, setSavedProfile] = useState<StructuredProfile>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [skillDraft, setSkillDraft] = useState("");

  const isDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  useEffect(() => {
    setProfile(initialProfile);
    setSavedProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  const currentRole = profile.experiences.find((e) => e.isCurrent) ?? null;

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(apiUrl(`/api/projects/${projectId}/profile`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          version: profile.version + 1,
          updatedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save profile");
      }

      setSavedProfile(profile);
      setLastSaved(new Date());
    } finally {
      setIsSaving(false);
    }
  };

  const saveRef = useRef(saveProfile);
  saveRef.current = saveProfile;
  useImperativeHandle(ref, () => ({ save: () => saveRef.current() }), []);

  const updateIdentity = (updates: Partial<StructuredProfile["identity"]>) => {
    setProfile((prev) => ({
      ...prev,
      identity: { ...prev.identity, ...updates },
    }));
  };

  const addSkill = (name: string, category: ProfileSkill["category"] = "technical") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (profile.skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;

    setProfile((prev) => ({
      ...prev,
      skills: [...prev.skills, { name: trimmed, category }],
    }));
  };

  const removeSkill = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    addSkill(skillDraft);
    setSkillDraft("");
  };

  const addRole = () => {
    const newRole: ProfileTargetRole = {
      title: "",
      level: "mid",
      priority: 5,
      reasons: [],
    };
    setProfile((prev) => ({
      ...prev,
      targeting: { ...prev.targeting, roles: [...prev.targeting.roles, newRole] },
    }));
  };

  const updateRole = (index: number, updates: Partial<ProfileTargetRole>) => {
    setProfile((prev) => ({
      ...prev,
      targeting: {
        ...prev.targeting,
        roles: prev.targeting.roles.map((r, i) => (i === index ? { ...r, ...updates } : r)),
      },
    }));
  };

  const removeRole = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      targeting: { ...prev.targeting, roles: prev.targeting.roles.filter((_, i) => i !== index) },
    }));
  };

  const addLocation = () => {
    const loc: ProfileLocation = { city: "", remote: "no", priority: 5 };
    setProfile((prev) => ({
      ...prev,
      targeting: { ...prev.targeting, locations: [...prev.targeting.locations, loc] },
    }));
  };

  const updateLocation = (index: number, updates: Partial<ProfileLocation>) => {
    setProfile((prev) => ({
      ...prev,
      targeting: {
        ...prev.targeting,
        locations: prev.targeting.locations.map((l, i) => (i === index ? { ...l, ...updates } : l)),
      },
    }));
  };

  const removeLocation = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      targeting: {
        ...prev.targeting,
        locations: prev.targeting.locations.filter((_, i) => i !== index),
      },
    }));
  };

  const addExperience = () => {
    const exp: ProfileExperience = {
      id: crypto.randomUUID(),
      company: "",
      title: "",
      duration: "",
      achievements: [],
      skillsUsed: [],
    };
    setProfile((prev) => ({ ...prev, experiences: [...prev.experiences, exp] }));
  };

  const updateExperience = (index: number, updates: Partial<ProfileExperience>) => {
    setProfile((prev) => ({
      ...prev,
      experiences: prev.experiences.map((e, i) => (i === index ? { ...e, ...updates } : e)),
    }));
  };

  const removeExperience = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>
            Extracted from your resume. Edit anything that looks off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={profile.identity.name || ""}
                onChange={(e) => updateIdentity({ name: e.target.value })}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-headline">Headline</Label>
              <Input
                id="profile-headline"
                value={profile.identity.headline || ""}
                onChange={(e) => updateIdentity({ headline: e.target.value })}
                placeholder="Senior Full-Stack Engineer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-summary">Summary</Label>
            <Textarea
              id="profile-summary"
              value={profile.identity.summary}
              onChange={(e) => updateIdentity({ summary: e.target.value })}
              placeholder="A short overview of who you are and what you bring..."
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-years">Years of experience</Label>
              <Input
                id="profile-years"
                type="number"
                min={0}
                value={profile.identity.yearsOfExperience ?? ""}
                onChange={(e) =>
                  updateIdentity({
                    yearsOfExperience: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                placeholder="5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="size-5 text-muted-foreground" />
            Current position
          </CardTitle>
          <CardDescription>
            Where you work right now. This helps the AI understand your starting point.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentRole ? (
            <CurrentPositionFields
              experience={currentRole}
              onChange={(updates) => {
                const idx = profile.experiences.findIndex((e) => e.id === currentRole.id);
                if (idx >= 0) updateExperience(idx, updates);
              }}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No current position set.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const exp: ProfileExperience = {
                    id: crypto.randomUUID(),
                    company: "",
                    title: "",
                    duration: "",
                    achievements: [],
                    skillsUsed: [],
                    isCurrent: true,
                  };
                  setProfile((prev) => ({
                    ...prev,
                    experiences: [exp, ...prev.experiences],
                  }));
                }}
              >
                <Plus className="size-4" />
                Add current position
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Desired positions</CardTitle>
            <CardDescription>
              The AI's best guess at what you're looking for, based on your career trajectory.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addRole}>
            <Plus className="size-4" />
            Add role
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.targeting.roles.map((role, index) => (
            <div
              key={`${role.title}:${role.level}:${role.priority}:${role.reasons.join("|")}`}
              className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={role.title}
                    onChange={(e) => updateRole(index, { title: e.target.value })}
                    placeholder="Frontend Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <select
                    value={role.level}
                    onChange={(e) =>
                      updateRole(index, { level: e.target.value as ProfileTargetRole["level"] })
                    }
                    className={selectClassName}
                  >
                    <option value="entry">Entry</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="lead">Lead</option>
                    <option value="principal">Principal</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Priority (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={role.priority}
                    onChange={(e) => updateRole(index, { priority: parseInt(e.target.value) || 5 })}
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="mt-6 shrink-0"
                onClick={() => removeRole(index)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          {profile.targeting.roles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No target roles yet. Add one so we know what to search for.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>
            Pulled from your resume. Add more with Enter or comma, remove with X.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={handleSkillKeyDown}
            placeholder="TypeScript, React, Node.js..."
          />
          {profile.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, index) => (
                <Badge key={skill.name} variant="secondary" className="gap-1 py-1 pl-3 pr-1.5">
                  {skill.name}
                  <button
                    type="button"
                    onClick={() => removeSkill(index)}
                    className="rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No skills added yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5 text-muted-foreground" />
              Preferred locations
            </CardTitle>
            <CardDescription>Where do you want to work?</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addLocation}>
            <Plus className="size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.targeting.locations.map((loc, index) => (
            <div
              key={`${loc.city}:${loc.state ?? ""}:${loc.remote}:${loc.priority}`}
              className="flex items-center gap-3"
            >
              <Input
                value={loc.city}
                onChange={(e) => updateLocation(index, { city: e.target.value })}
                placeholder="City"
                className="w-36"
              />
              <Input
                value={loc.state || ""}
                onChange={(e) => updateLocation(index, { state: e.target.value })}
                placeholder="State"
                className="w-28"
              />
              <select
                value={loc.remote}
                onChange={(e) =>
                  updateLocation(index, { remote: e.target.value as ProfileLocation["remote"] })
                }
                className={`${selectClassName} w-28`}
              >
                <option value="no">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="full">Remote</option>
              </select>
              <Button variant="ghost" size="icon" onClick={() => removeLocation(index)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          {profile.targeting.locations.length === 0 && (
            <p className="text-sm text-muted-foreground">No locations added.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Work history</CardTitle>
            <CardDescription>
              Roles and achievements extracted from your resume. Edit details or add missing
              entries.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addExperience}>
            <Plus className="size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile.experiences.map((exp, index) => (
            <div key={exp.id} className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input
                      value={exp.company}
                      onChange={(e) => updateExperience(index, { company: e.target.value })}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={exp.title}
                      onChange={(e) => updateExperience(index, { title: e.target.value })}
                      placeholder="Software Engineer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Input
                      value={exp.duration}
                      onChange={(e) => updateExperience(index, { duration: e.target.value })}
                      placeholder="Jan 2020 - Present"
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <label className="flex items-center gap-2 pb-2">
                      <input
                        type="checkbox"
                        checked={exp.isCurrent || false}
                        onChange={(e) => updateExperience(index, { isCurrent: e.target.checked })}
                        className="size-4 rounded border"
                      />
                      <span className="text-sm">Current</span>
                    </label>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeExperience(index)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Achievements (one per line)</Label>
                <Textarea
                  value={exp.achievements.join("\n")}
                  onChange={(e) =>
                    updateExperience(index, {
                      achievements: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  placeholder="Led migration to TypeScript, reducing bugs by 30%"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Skills used (comma separated)</Label>
                <Input
                  value={exp.skillsUsed.join(", ")}
                  onChange={(e) =>
                    updateExperience(index, {
                      skillsUsed: e.target.value.split(",").map((s) => s.trim()),
                    })
                  }
                  placeholder="TypeScript, React, PostgreSQL"
                />
              </div>
            </div>
          ))}
          {profile.experiences.length === 0 && (
            <p className="text-sm text-muted-foreground">No experience entries yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company preferences</CardTitle>
          <CardDescription>
            Inferred from your background. Adjust to narrow your job search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Company size</Label>
              <select
                value={profile.targeting.companyPreference.size || ""}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    targeting: {
                      ...prev.targeting,
                      companyPreference: {
                        ...prev.targeting.companyPreference,
                        size: e.target.value
                          ? (e.target
                              .value as StructuredProfile["targeting"]["companyPreference"]["size"])
                          : undefined,
                      },
                    },
                  }))
                }
                className={selectClassName}
              >
                <option value="">Any</option>
                <option value="startup">Startup</option>
                <option value="small">Small</option>
                <option value="mid">Mid-size</option>
                <option value="large">Large</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <select
                value={profile.targeting.companyPreference.stage || ""}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    targeting: {
                      ...prev.targeting,
                      companyPreference: {
                        ...prev.targeting.companyPreference,
                        stage: e.target.value
                          ? (e.target
                              .value as StructuredProfile["targeting"]["companyPreference"]["stage"])
                          : undefined,
                      },
                    },
                  }))
                }
                className={selectClassName}
              >
                <option value="">Any</option>
                <option value="seed">Seed</option>
                <option value="early">Early</option>
                <option value="growth">Growth</option>
                <option value="established">Established</option>
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Industries (comma separated)</Label>
              <Input
                value={profile.targeting.companyPreference.industries.join(", ")}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    targeting: {
                      ...prev.targeting,
                      companyPreference: {
                        ...prev.targeting.companyPreference,
                        industries: e.target.value.split(",").map((s) => s.trim()),
                      },
                    },
                  }))
                }
                placeholder="FinTech, SaaS, HealthTech"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Industries to avoid (comma separated)</Label>
              <Input
                value={profile.targeting.companyPreference.avoidIndustries.join(", ")}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    targeting: {
                      ...prev.targeting,
                      companyPreference: {
                        ...prev.targeting.companyPreference,
                        avoidIndustries: e.target.value.split(",").map((s) => s.trim()),
                      },
                    },
                  }))
                }
                placeholder="Gambling, Oil & Gas"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search keywords</CardTitle>
          <CardDescription>
            Terms the AI will use when searching for jobs. Generated from your profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.searchContext.effectiveKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.searchContext.effectiveKeywords.map((kw) => (
                <Badge key={kw} variant="secondary">
                  {kw}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Keywords will appear here after the profile is built.
            </p>
          )}
        </CardContent>
      </Card>

      {profile.memory.discoveredPreferences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Discovered preferences</CardTitle>
            <CardDescription>
              Things the AI picked up about you from your resume and conversations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profile.memory.discoveredPreferences.map((p) => (
                <div key={`${p.source}:${p.preference}`} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className="mt-0.5 shrink-0">
                    {p.source}
                  </Badge>
                  <span>{p.preference}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {profile.memory.clarifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Remembered answers</CardTitle>
            <CardDescription>
              Answers you gave during the interview that shaped this profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.memory.clarifications.map((c) => (
              <div key={`${c.questionId}:${c.answeredAt}`} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{c.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {lastSaved && (
        <p className="text-center text-sm text-muted-foreground">
          Last saved {lastSaved.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
});

function CurrentPositionFields({
  experience,
  onChange,
}: {
  experience: ProfileExperience;
  onChange: (updates: Partial<ProfileExperience>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Company</Label>
        <Input
          value={experience.company}
          onChange={(e) => onChange({ company: e.target.value })}
          placeholder="Where you work now"
        />
      </div>
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={experience.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Your current role"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Duration</Label>
        <Input
          value={experience.duration}
          onChange={(e) => onChange({ duration: e.target.value })}
          placeholder="Jan 2022 - Present"
        />
      </div>
    </div>
  );
}

function ProfileModelSettings({
  providers,
  selection,
  onSelectionChange,
}: {
  providers: ProviderOption[];
  selection?: ChatModelSelection;
  onSelectionChange: (selection: ChatModelSelection) => void;
}) {
  const available = providers.filter((p) => p.available);
  const activeProvider = providers.find((p) => p.id === selection?.provider);
  const activeModel = activeProvider?.models.find((m) => m.slug === selection?.model);
  const efforts = activeModel?.capabilities.reasoningEffort ?? [];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
            <Settings2 className="size-4" />
            {activeModel?.name ?? "Model"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile build settings</DialogTitle>
          <DialogDescription>
            Choose which model and reasoning level to use when building your profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <select
              value={selection?.provider ?? ""}
              onChange={(e) => {
                const provider = available.find((p) => p.id === e.target.value);
                if (!provider || provider.models.length === 0) return;
                const model = provider.models[0];
                onSelectionChange({
                  provider: provider.id,
                  model: model.slug,
                  effort: model.capabilities.defaultEffort,
                });
              }}
              className={selectClassName}
            >
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {PROVIDER_DISPLAY_NAMES[p.id]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <select
              value={selection?.model ?? ""}
              onChange={(e) => {
                const model = activeProvider?.models.find((m) => m.slug === e.target.value);
                if (!model) return;
                onSelectionChange({
                  ...selection,
                  model: model.slug,
                  effort: model.capabilities.defaultEffort,
                });
              }}
              className={selectClassName}
            >
              {activeProvider?.models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {efforts.length > 0 && (
            <div className="space-y-2">
              <Label>Reasoning level</Label>
              <select
                value={selection?.effort ?? ""}
                onChange={(e) => {
                  onSelectionChange({ ...selection, effort: e.target.value });
                }}
                className={selectClassName}
              >
                {efforts.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
