import { rmSync } from "node:fs";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../../db";
import {
  applicationAnswers,
  chatMessages,
  chatThreads,
  claimThreads,
  coachClaims,
  coachGaps,
  coachNextSteps,
  coachReviewJds,
  coachReviews,
  coachSuggestions,
  coachThreadAnchors,
  documents,
  events,
  explorerConfigs,
  insightCards,
  jobMatches,
  jobs,
  profiles,
  projects,
  providerSessionRuntime,
  questionAnswers,
  questionCards,
  questions,
  resumeAnalyses,
  tailoringReviewHistory,
  tailoringReviews,
  tasks,
  threadCommands,
  threadEvents,
  threadProjections,
  topicFiles,
} from "../../db/schema";
import { makeId } from "../../lib/ids";
import { createProjectSlug, ensureProjectDir, ensureScopeDir, projectDir } from "../../lib/paths";

function now(): string {
  return new Date().toISOString();
}

/**
 * Backfills missing project slugs without rewriting rows that already have a
 * stable slug.
 *
 * This is mainly a migration-safety helper for older local data.
 */
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

/**
 * Creates a new project and all of the supporting records/directories expected
 * by the rest of the server.
 */
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

/**
 * Deletes a project and every record that hangs off it, then removes its
 * on-disk directory. Returns `false` when no project matched the given id.
 *
 * SQLite foreign keys are not enabled on this connection, so the schema's
 * `ON DELETE CASCADE` rules do not fire automatically. Children are therefore
 * deleted explicitly here, deepest first. Tables keyed only by a thread/review/
 * claim id are scoped back to the project via subqueries; tables that carry a
 * `projectId` are deleted directly.
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  const project = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!project) {
    return false;
  }

  const threadIds = db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(eq(chatThreads.projectId, projectId));
  const reviewIds = db
    .select({ id: coachReviews.id })
    .from(coachReviews)
    .where(eq(coachReviews.projectId, projectId));
  const claimIds = db
    .select({ id: coachClaims.id })
    .from(coachClaims)
    .where(inArray(coachClaims.reviewId, reviewIds));

  // Thread-scoped tables (no projectId column).
  await db.delete(coachThreadAnchors).where(inArray(coachThreadAnchors.threadId, threadIds));
  await db.delete(threadProjections).where(inArray(threadProjections.threadId, threadIds));
  await db.delete(threadEvents).where(inArray(threadEvents.threadId, threadIds));
  await db.delete(threadCommands).where(inArray(threadCommands.threadId, threadIds));
  await db
    .delete(providerSessionRuntime)
    .where(inArray(providerSessionRuntime.threadId, threadIds));

  // Coach review/claim-scoped tables (no projectId column).
  await db.delete(claimThreads).where(inArray(claimThreads.claimId, claimIds));
  await db.delete(coachSuggestions).where(inArray(coachSuggestions.claimId, claimIds));
  await db.delete(coachClaims).where(inArray(coachClaims.reviewId, reviewIds));
  await db.delete(coachNextSteps).where(inArray(coachNextSteps.reviewId, reviewIds));
  await db.delete(coachGaps).where(inArray(coachGaps.reviewId, reviewIds));
  await db.delete(coachReviewJds).where(inArray(coachReviewJds.reviewId, reviewIds));

  // Direct project children.
  await db.delete(coachReviews).where(eq(coachReviews.projectId, projectId));
  await db.delete(chatMessages).where(eq(chatMessages.projectId, projectId));
  await db.delete(chatThreads).where(eq(chatThreads.projectId, projectId));
  await db.delete(jobMatches).where(eq(jobMatches.projectId, projectId));
  await db.delete(tailoringReviews).where(eq(tailoringReviews.projectId, projectId));
  await db.delete(tailoringReviewHistory).where(eq(tailoringReviewHistory.projectId, projectId));
  await db.delete(jobs).where(eq(jobs.projectId, projectId));
  await db.delete(tasks).where(eq(tasks.projectId, projectId));
  await db.delete(documents).where(eq(documents.projectId, projectId));
  await db.delete(explorerConfigs).where(eq(explorerConfigs.projectId, projectId));
  await db.delete(questions).where(eq(questions.projectId, projectId));
  await db.delete(questionAnswers).where(eq(questionAnswers.projectId, projectId));
  await db.delete(questionCards).where(eq(questionCards.projectId, projectId));
  await db.delete(profiles).where(eq(profiles.projectId, projectId));
  await db.delete(applicationAnswers).where(eq(applicationAnswers.projectId, projectId));
  await db.delete(topicFiles).where(eq(topicFiles.projectId, projectId));
  await db.delete(insightCards).where(eq(insightCards.projectId, projectId));
  await db.delete(resumeAnalyses).where(eq(resumeAnalyses.projectId, projectId));
  await db.delete(events).where(eq(events.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));

  if (project.slug) {
    rmSync(projectDir(project.slug), { recursive: true, force: true });
  }

  return true;
}
