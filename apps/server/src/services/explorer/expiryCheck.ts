import { and, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "../../db";
import { explorerConfigs, jobs } from "../../db/schema";
import { logInfo, logWarn } from "../../lib/log";
import { mapExplorerConfigRow } from "../projects/explorerConfig";
import { writeProjectRuntimeEvent } from "../runtimeEvents";

/** Page-text snippets that mean the listing is gone (checked lowercased). */
const EXPIRY_MARKERS = [
  "no longer advertised",
  "job has expired",
  "job ad has expired",
  "this job is no longer available",
  "no longer accepting applications",
  "position has been filled",
  "vacancy has closed",
  "listing has been removed",
];

const FETCH_TIMEOUT_MS = 15_000;
/** Re-check a job at most once per day. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Scheduler tick: hourly; the per-job 24h gate makes ticks cheap. */
const SCHEDULER_TICK_MS = 60 * 60 * 1000;

const now = () => new Date().toISOString();

/**
 * Fetches a job URL and decides whether the listing has expired: hard 404/410,
 * or an expiry marker in the page text. Network errors are treated as
 * inconclusive (false) so a flaky connection never marks live jobs expired.
 */
export async function checkJobUrlExpired(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; jobseeker-expiry-check)" },
    });

    if (response.status === 404 || response.status === 410) return true;
    if (!response.ok) return false;

    const text = (await response.text()).toLowerCase();
    return EXPIRY_MARKERS.some((marker) => text.includes(marker));
  } catch {
    return false;
  }
}

/**
 * Checks every live job in a project whose last check is older than a day.
 * Marks expired listings and emits one jobs.updated event so clients refetch.
 */
export async function runExpiryCheckForProject(projectId: string): Promise<number> {
  const cutoff = new Date(Date.now() - CHECK_INTERVAL_MS).toISOString();
  const dueJobs = await db
    .select({ id: jobs.id, url: jobs.url })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        isNull(jobs.expiredAt),
        or(isNull(jobs.lastExpiryCheckAt), lt(jobs.lastExpiryCheckAt, cutoff)),
      ),
    )
    .all();

  let expiredCount = 0;
  for (const job of dueJobs) {
    const expired = await checkJobUrlExpired(job.url);
    await db
      .update(jobs)
      .set({ lastExpiryCheckAt: now(), ...(expired ? { expiredAt: now() } : {}) })
      .where(eq(jobs.id, job.id))
      .run();
    if (expired) expiredCount += 1;
  }

  if (expiredCount > 0) {
    await writeProjectRuntimeEvent(projectId, "jobs.updated", {
      reason: "expiry_check",
      expired: expiredCount,
    });
    logInfo("expiry check marked jobs expired", { projectId, expiredCount });
  }

  return expiredCount;
}

/** Projects that opted into the daily expiry check via explorer config. */
async function projectsWithExpiryCheck(): Promise<string[]> {
  const rows = await db.select().from(explorerConfigs).all();
  return rows
    .filter((row) => mapExplorerConfigRow(row).search.checkExpiredDaily === true)
    .map((row) => row.projectId);
}

/**
 * Hourly scheduler. The per-job lastExpiryCheckAt gate (24h) makes ticks
 * idempotent across restarts — no separate "last run" bookkeeping needed.
 */
export function startExpiryScheduler(): void {
  const tick = async () => {
    try {
      const projectIds = await projectsWithExpiryCheck();
      for (const projectId of projectIds) {
        await runExpiryCheckForProject(projectId);
      }
    } catch (error) {
      logWarn("expiry check tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  setInterval(() => void tick(), SCHEDULER_TICK_MS);
  // First pass shortly after boot so an opted-in project doesn't wait an hour.
  setTimeout(() => void tick(), 30_000);
  logInfo("expiry scheduler started", { tickMs: SCHEDULER_TICK_MS });
}
