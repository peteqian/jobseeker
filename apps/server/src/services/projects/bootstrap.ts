import { asc, eq } from "drizzle-orm";

import { db } from "../../db";
import { chatThreads, explorerConfigs, projects } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { createProjectSlug, ensureProjectDir, ensureScopeDir } from "../../lib/paths";

function now(): string {
  return new Date().toISOString();
}

export async function ensureProjectSlugs(): Promise<void> {
  const rows = await db.select().from(projects).orderBy(asc(projects.createdAt)).all();
  const used = new Set<string>();

  for (const row of rows) {
    const nextSlug = row.slug?.trim() || createProjectSlug(row.title, row.id);
    if (used.has(nextSlug)) {
      continue;
    }
    used.add(nextSlug);
    if (row.slug === nextSlug) {
      continue;
    }
    await db.update(projects).set({ slug: nextSlug }).where(eq(projects.id, row.id));
  }
}

export async function createProject(title: string) {
  const timestamp = now();
  const projectId = makeId("project");
  const projectSlug = createProjectSlug(title, projectId);

  await db.insert(projects).values({
    id: projectId,
    slug: projectSlug,
    title,
    status: "idle",
    activeResumeSourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  ensureProjectDir(projectSlug);
  ensureScopeDir(projectSlug, "coach");
  ensureScopeDir(projectSlug, "explorer");

  await db.insert(explorerConfigs).values({
    projectId,
    domainsJson: JSON.stringify([]),
    includeAgentSuggestions: true,
    updatedAt: timestamp,
  });

  await db.insert(chatThreads).values([
    {
      id: makeId("thread"),
      projectId,
      scope: "coach",
      title: "Coach",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: makeId("thread"),
      projectId,
      scope: "explorer",
      title: "Explorer",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);

  return { projectId };
}
