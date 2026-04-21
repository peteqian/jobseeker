import { eq } from "drizzle-orm";
import type { StructuredProfile } from "@jobseeker/contracts";

import { db } from "../../db";
import { profiles, projects } from "../../db/schema";
import { createProjectSlug, ensureProjectDir } from "../../lib/paths";

export async function readProjectProfile(projectId: string): Promise<StructuredProfile | null> {
  const row = await db.select().from(profiles).where(eq(profiles.projectId, projectId)).get();
  if (!row) return null;
  return JSON.parse(row.profileJson) as StructuredProfile;
}

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
