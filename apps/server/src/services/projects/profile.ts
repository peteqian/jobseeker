import { eq } from "drizzle-orm";
import {
  normalizeEducation,
  normalizeExperience,
  normalizeWorkRights,
  type ProfilePointDetail,
  type StructuredProfile,
} from "@jobseeker/contracts";

import { db } from "../../db";
import { profiles, projects } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { createProjectSlug, ensureProjectDir } from "../../lib/paths";

/** Reads the latest structured profile for a project, if one has been built. */
export async function readProjectProfile(projectId: string): Promise<StructuredProfile | null> {
  const row = await db.select().from(profiles).where(eq(profiles.projectId, projectId)).get();
  if (!row) return null;
  const profile = JSON.parse(row.profileJson) as StructuredProfile;
  // Fold any legacy shapes into the current ones at the single read boundary,
  // so every consumer sees the normalized form.
  return {
    ...profile,
    workRights: normalizeWorkRights(profile.workRights),
    experiences: profile.experiences.map(normalizeExperience),
    education: (profile.education ?? []).map(normalizeEducation),
    projects: profile.projects ?? [],
    pointDetails: profile.pointDetails ?? [],
  };
}

/**
 * Records (or updates) a resume point expanded during the coach interview.
 * Matches an existing detail by claimId when present, otherwise by the original
 * line, so re-answering a point overwrites in place rather than duplicating.
 * Returns the updated profile, or null when no profile exists yet.
 */
export async function upsertPointDetail(
  projectId: string,
  input: {
    claimId?: string;
    originalText: string;
    expandedDetail: string;
    evidence: string[];
    resumeAngle?: string;
  },
): Promise<StructuredProfile | null> {
  const profile = await readProjectProfile(projectId);
  if (!profile) return null;

  const details = profile.pointDetails ?? [];
  const matchIndex = details.findIndex((d) =>
    input.claimId ? d.claimId === input.claimId : d.originalText === input.originalText,
  );
  const existing = matchIndex >= 0 ? details[matchIndex] : null;

  const timestamp = new Date().toISOString();
  const detail: ProfilePointDetail = {
    id: existing?.id ?? makeId("pdetail"),
    claimId: input.claimId ?? existing?.claimId,
    originalText: input.originalText || existing?.originalText || "",
    expandedDetail: input.expandedDetail,
    evidence: input.evidence,
    resumeAngle: input.resumeAngle ?? existing?.resumeAngle,
    source: "interview",
    updatedAt: timestamp,
  };

  const nextDetails =
    matchIndex >= 0 ? details.map((d, i) => (i === matchIndex ? detail : d)) : [...details, detail];

  const next: StructuredProfile = { ...profile, pointDetails: nextDetails, updatedAt: timestamp };
  await upsertProjectProfile(projectId, next);
  await writeProfileFile(projectId, next);
  return next;
}

/** Inserts or replaces the project's durable structured profile row. */
export async function upsertProjectProfile(
  projectId: string,
  profile: StructuredProfile,
): Promise<void> {
  await db
    .insert(profiles)
    .values({
      projectId,
      profileJson: JSON.stringify(profile),
      updatedAt: profile.updatedAt,
    })
    .onConflictDoUpdate({
      target: profiles.projectId,
      set: {
        profileJson: JSON.stringify(profile),
        updatedAt: profile.updatedAt,
      },
    });
}

/**
 * Writes the human-readable `profile.json` mirror stored in the project's local
 * directory.
 */
export async function writeProfileFile(
  projectId: string,
  profile: StructuredProfile,
): Promise<void> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return;
  }

  const slug = project.slug ?? createProjectSlug(project.title, project.id);
  const dir = ensureProjectDir(slug);
  await Bun.write(`${dir}/profile.json`, JSON.stringify(profile, null, 2));
}
