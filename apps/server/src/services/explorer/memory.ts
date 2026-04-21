import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DistilledTrajectory, Extractor, TrajectoryStep } from "@jobseeker/browser-agent";

import { db } from "../../db";
import { pageMemory } from "../../db/schema";
import { makeId } from "../../lib/ids";

export type PageMemoryStatus = "untrusted" | "trusted" | "broken";

export interface PageMemoryRecord {
  id: string;
  fingerprint: string;
  urlPattern: string | null;
  trajectory: DistilledTrajectory;
  sampleJobs: unknown;
  status: PageMemoryStatus;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastUsedAt: string | null;
  lastBrokenAt: string | null;
}

// Thresholds for the promote/demote state machine.
const TRUSTED_PROMOTE_SUCCESS_COUNT = 1;
const BROKEN_THRESHOLD_CONSECUTIVE_FAILURES = 2;
const DELETE_THRESHOLD_CONSECUTIVE_FAILURES = 4;

function parseTrajectory(trajectoryJson: string, extractorJson: string): DistilledTrajectory {
  return {
    actions: JSON.parse(trajectoryJson) as TrajectoryStep[],
    extractor: JSON.parse(extractorJson) as Extractor,
  };
}

// Lookup by LANDING-page fingerprint. Agents save memory keyed on the landing DOM,
// not the results DOM, so callers must pass the fingerprint computed immediately
// after `page.goto(startUrl)` (before any agent/replay mutation).
export async function lookupPageMemory(fingerprint: string): Promise<PageMemoryRecord | null> {
  const row = await db
    .select()
    .from(pageMemory)
    .where(and(eq(pageMemory.fingerprint, fingerprint), ne(pageMemory.status, "broken")))
    .orderBy(desc(pageMemory.successCount), desc(pageMemory.lastUsedAt))
    .limit(1)
    .get();

  if (!row) return null;

  return {
    id: row.id,
    fingerprint: row.fingerprint,
    urlPattern: row.urlPattern,
    trajectory: parseTrajectory(row.trajectoryJson, row.extractorJson),
    sampleJobs: row.sampleJobsJson ? JSON.parse(row.sampleJobsJson) : null,
    status: row.status as PageMemoryStatus,
    successCount: row.successCount,
    failureCount: row.failureCount,
    consecutiveFailures: row.consecutiveFailures,
    lastUsedAt: row.lastUsedAt,
    lastBrokenAt: row.lastBrokenAt,
  };
}

// Called after a fresh-session replay validated the trajectory extracts jobs. Starts
// at `untrusted` with one success — a second success promotes to `trusted`.
export async function savePageMemory(input: {
  fingerprint: string;
  urlPattern: string | null;
  trajectory: DistilledTrajectory;
  sampleJobs?: unknown;
}): Promise<string> {
  const now = new Date().toISOString();
  const id = makeId("pmem");
  await db.insert(pageMemory).values({
    id,
    fingerprint: input.fingerprint,
    urlPattern: input.urlPattern,
    trajectoryJson: JSON.stringify(input.trajectory.actions),
    extractorJson: JSON.stringify(input.trajectory.extractor),
    sampleJobsJson: input.sampleJobs ? JSON.stringify(input.sampleJobs) : null,
    status: "untrusted",
    successCount: 1,
    failureCount: 0,
    consecutiveFailures: 0,
    lastUsedAt: now,
    lastBrokenAt: null,
    createdAt: now,
  });
  return id;
}

export async function markPageMemorySuccess(id: string, sampleJobs?: unknown): Promise<void> {
  const now = new Date().toISOString();
  const row = await db.select().from(pageMemory).where(eq(pageMemory.id, id)).get();
  if (!row) return;
  const nextSuccessCount = row.successCount + 1;
  const nextStatus: PageMemoryStatus =
    nextSuccessCount >= TRUSTED_PROMOTE_SUCCESS_COUNT + 1
      ? "trusted"
      : (row.status as PageMemoryStatus);
  await db
    .update(pageMemory)
    .set({
      successCount: sql`${pageMemory.successCount} + 1`,
      consecutiveFailures: 0,
      lastUsedAt: now,
      lastBrokenAt: null,
      status: nextStatus,
      ...(sampleJobs ? { sampleJobsJson: JSON.stringify(sampleJobs) } : {}),
    })
    .where(eq(pageMemory.id, id));
}

// Returns the new status the row settled into (useful for callers deciding whether
// to retry with agent discovery or skip).
export async function markPageMemoryFailure(id: string): Promise<PageMemoryStatus | "deleted"> {
  const row = await db.select().from(pageMemory).where(eq(pageMemory.id, id)).get();
  if (!row) return "deleted";
  const nextConsecutive = row.consecutiveFailures + 1;

  if (nextConsecutive >= DELETE_THRESHOLD_CONSECUTIVE_FAILURES) {
    await db.delete(pageMemory).where(eq(pageMemory.id, id));
    return "deleted";
  }

  const nextStatus: PageMemoryStatus =
    nextConsecutive >= BROKEN_THRESHOLD_CONSECUTIVE_FAILURES
      ? "broken"
      : (row.status as PageMemoryStatus);
  const now = new Date().toISOString();
  await db
    .update(pageMemory)
    .set({
      failureCount: sql`${pageMemory.failureCount} + 1`,
      consecutiveFailures: nextConsecutive,
      lastBrokenAt: now,
      status: nextStatus,
    })
    .where(eq(pageMemory.id, id));

  return nextStatus;
}
