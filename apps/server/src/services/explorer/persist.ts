import { and, eq, lt } from "drizzle-orm";
import type { FoundJob } from "./jobTypes";

import { db } from "../../db";
import { jobMatches, jobs } from "../../db/schema";
import { makeId } from "../../lib/ids";

export interface PersistResult {
  jobId: string;
  url: string;
}

/**
 * Deletes stale explorer jobs from prior runs only after the current run has
 * produced replacement rows.
 */
export async function deleteOldExplorerJobs(projectId: string, cutoffIso: string): Promise<void> {
  const stale = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.source, "explorer"),
        lt(jobs.createdAt, cutoffIso),
      ),
    )
    .all();

  for (const row of stale) {
    await db.delete(jobMatches).where(eq(jobMatches.jobId, row.id));
  }

  await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.source, "explorer"),
        lt(jobs.createdAt, cutoffIso),
      ),
    );
}

/**
 * Inserts one discovered explorer job (deduped by normalized URL) with a
 * `pending` match placeholder. The full-description match level is filled in
 * later by the match pass — see `services/match/runMatchingPass.ts`. Returns the
 * new job id + url so the caller can collect them for that pass, or null when
 * the job is a duplicate / has an unusable URL.
 */
export async function saveDiscoveredJob(input: {
  projectId: string;
  job: FoundJob;
  seenUrls: Set<string>;
}): Promise<PersistResult | null> {
  const normalizedUrl = normalizeAbsoluteUrl(input.job.url);
  if (!normalizedUrl) return null;
  const key = normalizedUrl.toLowerCase();
  if (!key) return null;
  if (input.seenUrls.has(key)) return null;
  input.seenUrls.add(key);

  const createdAt = new Date().toISOString();
  const jobId = makeId("job");

  const inserted = await db
    .insert(jobs)
    .values({
      id: jobId,
      projectId: input.projectId,
      source: "explorer",
      title: input.job.title,
      company: input.job.company,
      location: input.job.location,
      url: normalizedUrl,
      summary: input.job.summary,
      salary: input.job.salary ?? null,
      createdAt,
    })
    .onConflictDoNothing({ target: [jobs.projectId, jobs.source, jobs.url] })
    .returning({ id: jobs.id })
    .all();

  const resolvedJobId = inserted[0]?.id;
  if (!resolvedJobId) {
    // Conflict with a prior row (e.g., same URL inserted concurrently). Skip
    // rather than colliding on a different jobId — the original row stands.
    return null;
  }

  await db.insert(jobMatches).values({
    jobId: resolvedJobId,
    projectId: input.projectId,
    level: "pending",
    score: 0,
    reasonsJson: JSON.stringify([]),
    gapsJson: JSON.stringify([]),
  });

  return { jobId: resolvedJobId, url: normalizedUrl };
}

/** Caches the full job-description text on a discovered job row. */
export async function setJobDescription(jobId: string, text: string): Promise<void> {
  await db.update(jobs).set({ descriptionText: text }).where(eq(jobs.id, jobId)).run();
}

/** Normalizes only absolute URLs; relative or malformed URLs are discarded. */
export function normalizeAbsoluteUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}
