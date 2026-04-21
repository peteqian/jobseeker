import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { Briefcase, MapPin, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { apiUrl } from "@/lib/api";
import type {
  ProfileExperience,
  ProfileLocation,
  ProfileSkill,
  ProfileTargetRole,
  ProjectSnapshot,
  StructuredProfile,
} from "@jobseeker/contracts";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface EditableProfileTargetRole extends ProfileTargetRole {
  _rowId: string;
}

interface EditableProfileLocation extends ProfileLocation {
  _rowId: string;
}

interface EditableProfile extends Omit<StructuredProfile, "targeting"> {
  targeting: Omit<StructuredProfile["targeting"], "roles" | "locations"> & {
    roles: EditableProfileTargetRole[];
    locations: EditableProfileLocation[];
  };
}

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

function createRowId() {
  return crypto.randomUUID();
}

function toEditableProfile(profile: StructuredProfile): EditableProfile {
  return {
    ...profile,
    targeting: {
      ...profile.targeting,
      roles: profile.targeting.roles.map((role) => ({ ...role, _rowId: createRowId() })),
      locations: profile.targeting.locations.map((location) => ({
        ...location,
        _rowId: createRowId(),
      })),
    },
  };
}

function toStructuredProfile(profile: EditableProfile): StructuredProfile {
  return {
    ...profile,
    targeting: {
      ...profile.targeting,
      roles: profile.targeting.roles.map(({ _rowId: _ignoredRowId, ...role }) => role),
      locations: profile.targeting.locations.map(
        ({ _rowId: _ignoredRowId, ...location }) => location,
      ),
    },
  };
}

function createEmptyRole(): EditableProfileTargetRole {
  return {
    _rowId: createRowId(),
    title: "",
    level: "mid",
    priority: 5,
    reasons: [],
  };
}

function createEmptyLocation(): EditableProfileLocation {
  return {
    _rowId: createRowId(),
    city: "",
    state: "",
    remote: "no",
    priority: 5,
  };
}

function createEmptyExperience(isCurrent = false): ProfileExperience {
  return {
    id: crypto.randomUUID(),
    company: "",
    title: "",
    duration: "",
    achievements: [],
    skillsUsed: [],
    isCurrent,
  };
}

export const ProfileEditor = forwardRef<ProfileEditorHandle, ProfileEditorProps>(
  function ProfileEditor(
    { projectId, initialProfile, onDirtyChange, onSavingChange, onSaved },
    ref,
  ) {
    const initialProfileToken = `${initialProfile.version}:${initialProfile.updatedAt}`;
    const initialEditorProfile = useMemo(() => toEditableProfile(initialProfile), [initialProfile]);
    const [skillDraft, setSkillDraft] = useState("");
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [savedSerializedProfile, setSavedSerializedProfile] = useState(() =>
      JSON.stringify(initialProfile),
    );

    const form = useForm({
      defaultValues: initialEditorProfile,
      onSubmit: async ({ value }) => {
        const nextProfilePayload: StructuredProfile = {
          ...toStructuredProfile(value),
          version: value.version + 1,
          updatedAt: new Date().toISOString(),
        };

        const response = await fetch(apiUrl(`/api/projects/${projectId}/profile`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextProfilePayload),
        });

        if (!response.ok) {
          throw new Error("Failed to save profile");
        }

        const snapshot = (await response.json()) as ProjectSnapshot;
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
    const experiences = useStore(form.store, (state) => state.values.experiences);
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

    const currentRoleIndex = experiences.findIndex((experience) => experience.isCurrent);

    return (
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <AboutSection form={form} />
        <CurrentPositionSection form={form} currentRoleIndex={currentRoleIndex} />
        <TargetRolesSection form={form} />
        <SkillsSection
          form={form}
          skillDraft={skillDraft}
          setSkillDraft={setSkillDraft}
          addSkill={addSkill}
        />
        <PreferredLocationsSection form={form} />
        <WorkHistorySection form={form} />
        <CompanyPreferencesSection form={form} />
        <ProfileInsightsSection
          searchKeywords={searchKeywords}
          discoveredPreferences={discoveredPreferences}
          clarifications={clarifications}
        />

        {lastSaved ? (
          <p className="text-center text-sm text-muted-foreground">
            Last saved {lastSaved.toLocaleTimeString()}
          </p>
        ) : null}
      </form>
    );
  },
);

type ProfileForm = typeof useForm<EditableProfile> extends (...args: never[]) => infer T
  ? T
  : never;

function AboutSection({ form }: { form: ProfileForm }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About you</CardTitle>
        <CardDescription>Extracted from your resume. Edit anything that looks off.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="identity.name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Full name</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="identity.headline">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Headline</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Senior Full-Stack Engineer"
                />
              </div>
            )}
          </form.Field>
        </div>

        <form.Field name="identity.summary">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Summary</Label>
              <Textarea
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="A short overview of who you are and what you bring..."
                rows={3}
              />
            </div>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="identity.yearsOfExperience">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Years of experience</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  min={0}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(
                      event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
                    );
                  }}
                  placeholder="5"
                />
              </div>
            )}
          </form.Field>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrentPositionSection({
  form,
  currentRoleIndex,
}: {
  form: ProfileForm;
  currentRoleIndex: number;
}) {
  return (
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
        <form.Field name="experiences" mode="array">
          {(experiencesField) =>
            currentRoleIndex >= 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ExperienceTextField
                  form={form}
                  name={`experiences[${currentRoleIndex}].company`}
                  label="Company"
                  placeholder="Where you work now"
                />
                <ExperienceTextField
                  form={form}
                  name={`experiences[${currentRoleIndex}].title`}
                  label="Title"
                  placeholder="Your current role"
                />
                <div className="sm:col-span-2">
                  <ExperienceTextField
                    form={form}
                    name={`experiences[${currentRoleIndex}].duration`}
                    label="Duration"
                    placeholder="Jan 2022 - Present"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No current position set.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => experiencesField.pushValue(createEmptyExperience(true))}
                >
                  <Plus className="size-4" />
                  Add current position
                </Button>
              </div>
            )
          }
        </form.Field>
      </CardContent>
    </Card>
  );
}

function TargetRolesSection({ form }: { form: ProfileForm }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Desired positions</CardTitle>
          <CardDescription>
            The AI's best guess at what you're looking for, based on your career trajectory.
          </CardDescription>
        </div>
        <form.Field name="targeting.roles" mode="array">
          {(rolesField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rolesField.pushValue(createEmptyRole())}
            >
              <Plus className="size-4" />
              Add role
            </Button>
          )}
        </form.Field>
      </CardHeader>
      <CardContent className="space-y-3">
        <form.Field name="targeting.roles" mode="array">
          {(rolesField) => (
            <>
              {rolesField.state.value.map((role, index) => (
                <div
                  key={role._rowId}
                  className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"
                >
                  <div className="grid flex-1 gap-3 sm:grid-cols-3">
                    <RoleTextField
                      form={form}
                      name={`targeting.roles[${index}].title`}
                      label="Title"
                      placeholder="Frontend Engineer"
                    />
                    <form.Field name={`targeting.roles[${index}].level` as const}>
                      {(field) => (
                        <div className="space-y-2">
                          <Label htmlFor={field.name}>Level</Label>
                          <select
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value as ProfileTargetRole["level"])
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
                      )}
                    </form.Field>
                    <form.Field name={`targeting.roles[${index}].priority` as const}>
                      {(field) => (
                        <div className="space-y-2">
                          <Label htmlFor={field.name}>Priority (1-10)</Label>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="number"
                            min={1}
                            max={10}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(Number.parseInt(event.target.value, 10) || 5)
                            }
                          />
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6 shrink-0"
                    onClick={() => rolesField.removeValue(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}

              {rolesField.state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No target roles yet. Add one so we know what to search for.
                </p>
              ) : null}
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}

function SkillsSection({
  form,
  skillDraft,
  setSkillDraft,
  addSkill,
}: {
  form: ProfileForm;
  skillDraft: string;
  setSkillDraft: (value: string) => void;
  addSkill: (value: string, category?: ProfileSkill["category"]) => void;
}) {
  return (
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
          onChange={(event) => setSkillDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== ",") return;
            event.preventDefault();
            addSkill(skillDraft);
            setSkillDraft("");
          }}
          placeholder="TypeScript, React, Node.js..."
        />

        <form.Field name="skills" mode="array">
          {(skillsField) =>
            skillsField.state.value.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skillsField.state.value.map((skill, index) => (
                  <Badge key={skill.name} variant="secondary" className="gap-1 py-1 pl-3 pr-1.5">
                    {skill.name}
                    <button
                      type="button"
                      onClick={() => skillsField.removeValue(index)}
                      className="rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No skills added yet.</p>
            )
          }
        </form.Field>
      </CardContent>
    </Card>
  );
}

function PreferredLocationsSection({ form }: { form: ProfileForm }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-muted-foreground" />
            Preferred locations
          </CardTitle>
          <CardDescription>Where do you want to work?</CardDescription>
        </div>
        <form.Field name="targeting.locations" mode="array">
          {(locationsField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => locationsField.pushValue(createEmptyLocation())}
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </form.Field>
      </CardHeader>
      <CardContent className="space-y-3">
        <form.Field name="targeting.locations" mode="array">
          {(locationsField) => (
            <>
              {locationsField.state.value.map((location, index) => (
                <div
                  key={location._rowId}
                  className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <LocationTextField
                    form={form}
                    name={`targeting.locations[${index}].city`}
                    placeholder="City"
                  />
                  <LocationTextField
                    form={form}
                    name={`targeting.locations[${index}].state`}
                    placeholder="State"
                  />
                  <form.Field name={`targeting.locations[${index}].remote` as const}>
                    {(field) => (
                      <select
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value as ProfileLocation["remote"])
                        }
                        className={selectClassName}
                      >
                        <option value="no">On-site</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="full">Remote</option>
                      </select>
                    )}
                  </form.Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => locationsField.removeValue(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}

              {locationsField.state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations added.</p>
              ) : null}
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}

function WorkHistorySection({ form }: { form: ProfileForm }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Work history</CardTitle>
          <CardDescription>
            Roles and achievements extracted from your resume. Edit details or add missing entries.
          </CardDescription>
        </div>
        <form.Field name="experiences" mode="array">
          {(experiencesField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => experiencesField.pushValue(createEmptyExperience())}
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </form.Field>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field name="experiences" mode="array">
          {(experiencesField) => (
            <>
              {experiencesField.state.value.map((experience, index) => (
                <div key={experience.id} className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <ExperienceTextField
                        form={form}
                        name={`experiences[${index}].company`}
                        label="Company"
                        placeholder="Acme Corp"
                      />
                      <ExperienceTextField
                        form={form}
                        name={`experiences[${index}].title`}
                        label="Title"
                        placeholder="Software Engineer"
                      />
                      <ExperienceTextField
                        form={form}
                        name={`experiences[${index}].duration`}
                        label="Duration"
                        placeholder="Jan 2020 - Present"
                      />
                      <form.Field name={`experiences[${index}].isCurrent` as const}>
                        {(field) => (
                          <div className="flex items-end gap-3">
                            <div className="flex items-center gap-2 pb-2">
                              <Switch
                                checked={field.state.value ?? false}
                                onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
                                aria-label="Mark as current role"
                              />
                              <span className="text-sm">Current</span>
                            </div>
                          </div>
                        )}
                      </form.Field>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => experiencesField.removeValue(index)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>

                  <form.Field name={`experiences[${index}].achievements` as const}>
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor={field.name}>Achievements (one per line)</Label>
                        <Textarea
                          id={field.name}
                          name={field.name}
                          value={field.state.value.join("\n")}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="Led migration to TypeScript, reducing bugs by 30%"
                          rows={2}
                        />
                      </div>
                    )}
                  </form.Field>

                  <form.Field name={`experiences[${index}].skillsUsed` as const}>
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor={field.name}>Skills used (comma separated)</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value.join(", ")}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="TypeScript, React, PostgreSQL"
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
              ))}

              {experiencesField.state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">No experience entries yet.</p>
              ) : null}
            </>
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}

function CompanyPreferencesSection({ form }: { form: ProfileForm }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company preferences</CardTitle>
        <CardDescription>
          Inferred from your background. Adjust to narrow your job search.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="targeting.companyPreference.size">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Company size</Label>
                <select
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value
                        ? (event.target
                            .value as StructuredProfile["targeting"]["companyPreference"]["size"])
                        : undefined,
                    )
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
            )}
          </form.Field>

          <form.Field name="targeting.companyPreference.stage">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Stage</Label>
                <select
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value
                        ? (event.target
                            .value as StructuredProfile["targeting"]["companyPreference"]["stage"])
                        : undefined,
                    )
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
            )}
          </form.Field>

          <form.Field name="targeting.companyPreference.industries">
            {(field) => (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={field.name}>Industries (comma separated)</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value.join(", ")}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="FinTech, SaaS, HealthTech"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="targeting.companyPreference.avoidIndustries">
            {(field) => (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={field.name}>Industries to avoid (comma separated)</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value.join(", ")}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Gambling, Oil & Gas"
                />
              </div>
            )}
          </form.Field>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileInsightsSection({
  searchKeywords,
  discoveredPreferences,
  clarifications,
}: {
  searchKeywords: string[];
  discoveredPreferences: StructuredProfile["memory"]["discoveredPreferences"];
  clarifications: StructuredProfile["memory"]["clarifications"];
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Search keywords</CardTitle>
          <CardDescription>
            Terms the AI will use when searching for jobs. Generated from your profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {searchKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {searchKeywords.map((keyword) => (
                <Badge key={keyword} variant="secondary">
                  {keyword}
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

      {discoveredPreferences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Discovered preferences</CardTitle>
            <CardDescription>
              Things the AI picked up about you from your resume and conversations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {discoveredPreferences.map((preference) => (
                <div
                  key={`${preference.source}:${preference.preference}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <Badge variant="outline" className="mt-0.5 shrink-0">
                    {preference.source}
                  </Badge>
                  <span>{preference.preference}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {clarifications.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Remembered answers</CardTitle>
            <CardDescription>
              Answers you gave during the interview that shaped this profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {clarifications.map((clarification) => (
              <div
                key={`${clarification.questionId}:${clarification.answeredAt}`}
                className="rounded-lg border p-3"
              >
                <p className="text-sm font-medium">{clarification.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{clarification.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function RoleTextField({
  form,
  name,
  label,
  placeholder,
}: {
  form: ProfileForm;
  name: `targeting.roles[${number}].title`;
  label: string;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <div className="space-y-2">
          <Label htmlFor={field.name}>{label}</Label>
          <Input
            id={field.name}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>
      )}
    </form.Field>
  );
}

function LocationTextField({
  form,
  name,
  placeholder,
}: {
  form: ProfileForm;
  name: `targeting.locations[${number}].city` | `targeting.locations[${number}].state`;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Input
          id={field.name}
          name={field.name}
          value={field.state.value ?? ""}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </form.Field>
  );
}

function ExperienceTextField({
  form,
  name,
  label,
  placeholder,
}: {
  form: ProfileForm;
  name:
    | `experiences[${number}].company`
    | `experiences[${number}].title`
    | `experiences[${number}].duration`;
  label: string;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <div className="space-y-2">
          <Label htmlFor={field.name}>{label}</Label>
          <Input
            id={field.name}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>
      )}
    </form.Field>
  );
}
