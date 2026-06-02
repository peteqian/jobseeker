import { useForm } from "@tanstack/react-form";

import {
  computeYearsOfExperience,
  normalizeExperience,
  normalizeWorkRights,
} from "@jobseeker/contracts";
import type {
  ProfileExperience,
  ProfileLocation,
  ProfileProject,
  ProfileTargetRole,
  ProfileWorkRightEntry,
  ProfileWorkRights,
  StructuredProfile,
  WorkRightStatus,
} from "@jobseeker/contracts";

export const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

// Cap the skills cloud so it stays scannable; the rest are one click away.
export const SKILL_DISPLAY_CAP = 18;

export const WORK_RIGHT_OPTIONS: { value: WorkRightStatus; label: string }[] = [
  { value: "unspecified", label: "Not specified" },
  { value: "citizen", label: "Citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "work_visa", label: "Work visa" },
  { value: "student_visa", label: "Student visa" },
  { value: "needs_sponsorship", label: "Requires sponsorship" },
];

export function createEmptyWorkRight(): EditableProfileWorkRightEntry {
  return { _rowId: createRowId(), country: "AU", status: "citizen" };
}

export interface EditableProfileTargetRole extends ProfileTargetRole {
  _rowId: string;
}

export interface EditableProfileLocation extends ProfileLocation {
  _rowId: string;
}

export interface EditableProfileWorkRightEntry extends ProfileWorkRightEntry {
  _rowId: string;
}

export interface EditableProfile extends Omit<
  StructuredProfile,
  "targeting" | "workRights" | "projects"
> {
  projects: ProfileProject[];
  targeting: Omit<StructuredProfile["targeting"], "roles" | "locations"> & {
    roles: EditableProfileTargetRole[];
    locations: EditableProfileLocation[];
  };
  workRights: Omit<ProfileWorkRights, "rights"> & {
    rights: EditableProfileWorkRightEntry[];
  };
}

export function createRowId() {
  return crypto.randomUUID();
}

export function toEditableProfile(profile: StructuredProfile): EditableProfile {
  // Tolerate the legacy AU-only shape if an un-normalized profile reaches us.
  const workRights = normalizeWorkRights(profile.workRights);
  return {
    ...profile,
    experiences: profile.experiences.map(normalizeExperience),
    projects: profile.projects ?? [],
    workRights: {
      ...workRights,
      rights: workRights.rights.map((entry) => ({ ...entry, _rowId: createRowId() })),
    },
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

export function toStructuredProfile(profile: EditableProfile): StructuredProfile {
  // Years of experience is editable but defaults to the value derived from
  // work-history dates when the user hasn't set one.
  const derivedYears = computeYearsOfExperience(profile.experiences);
  return {
    ...profile,
    identity: {
      ...profile.identity,
      yearsOfExperience:
        profile.identity.yearsOfExperience ?? (derivedYears > 0 ? derivedYears : undefined),
    },
    workRights: {
      ...profile.workRights,
      rights: profile.workRights.rights.map(({ _rowId: _ignoredRowId, ...entry }) => entry),
    },
    targeting: {
      ...profile.targeting,
      roles: profile.targeting.roles.map(({ _rowId: _ignoredRowId, ...role }) => role),
      locations: profile.targeting.locations.map(
        ({ _rowId: _ignoredRowId, ...location }) => location,
      ),
    },
  };
}

export function createEmptyLocation(): EditableProfileLocation {
  return {
    _rowId: createRowId(),
    city: "",
    state: "",
    remote: "no",
    priority: 5,
  };
}

export function createEmptyExperience(isCurrent = false): ProfileExperience {
  return {
    id: crypto.randomUUID(),
    company: "",
    title: "",
    achievements: [],
    skillsUsed: [],
    isCurrent,
  };
}

export function createEmptyProject(): ProfileProject {
  return { id: crypto.randomUUID(), name: "", description: "", skillsUsed: [] };
}

// Where the AI picked up a discovered preference — disambiguates the source
// chip from the AI-guess marker (this is provenance, not a guess flag).
export const PREFERENCE_SOURCE_LABELS: Record<string, string> = {
  resume: "from resume",
  question: "from Q&A",
  discovery: "discovered",
};

// Reusable form-instance type. tanstack's `useForm` has too many generics to
// spell out, so we derive the API type from a type-only shape hook (never
// called — referenced solely via `typeof`).
function useProfileFormShape() {
  return useForm({ defaultValues: {} as EditableProfile });
}
export type ProfileForm = ReturnType<typeof useProfileFormShape>;
