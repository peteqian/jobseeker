import { and, eq } from "drizzle-orm";
import type { ChatModelSelection, MatchLevel, StructuredProfile } from "@jobseeker/contracts";

import { db } from "../../db";
import { jobMatches, jobs } from "../../db/schema";
import { logInfo, logWarn } from "../../lib/log";
import { withCodexAuthGuard } from "../llm/codexAuth";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { assessMatch } from "./assessMatch";

export interface MatchPassJob {
  jobId: string;
  title: string;
  company: string;
  location: string;
  /** Listing snippet, used as a fallback when the cached JD is empty. */
  summary: string;
}

/** Written when the JD can't be read and the model can't judge — keeps the job
 * visible (under "partial") instead of silently dropping it. */
function fallbackMatch(reason: string): {
  level: MatchLevel;
  score: number;
  reasons: string[];
  gaps: string[];
} {
  return { level: "partial", score: 50, reasons: [reason], gaps: [] };
}

async function persistMatch(
  projectId: string,
  jobId: string,
  result: { level: MatchLevel; score: number; reasons: string[]; gaps: string[] },
): Promise<void> {
  await db
    .update(jobMatches)
    .set({
      level: result.level,
      score: result.score,
      reasonsJson: JSON.stringify(result.reasons),
      gapsJson: JSON.stringify(result.gaps),
    })
    .where(and(eq(jobMatches.jobId, jobId), eq(jobMatches.projectId, projectId)))
    .run();
}

async function matchOne(input: {
  projectId: string;
  profile: StructuredProfile;
  job: MatchPassJob;
  modelSelection?: ChatModelSelection;
}): Promise<void> {
  const { projectId, profile, job, modelSelection } = input;

  // The full JD was fetched and cached during the crawl (in its logged-in
  // session, so login-walled pages are readable). Fall back to the listing
  // summary if it couldn't be read.
  const row = await db
    .select({ descriptionText: jobs.descriptionText })
    .from(jobs)
    .where(eq(jobs.id, job.jobId))
    .get();
  const descriptionText = row?.descriptionText?.trim() || job.summary;

  if (!descriptionText.trim()) {
    await persistMatch(projectId, job.jobId, fallbackMatch("Could not read the job description"));
    return;
  }

  const assessment = await assessMatch({
    job: { title: job.title, company: job.company, location: job.location },
    descriptionText,
    profile,
    modelSelection,
  });

  if (!assessment) {
    await persistMatch(projectId, job.jobId, fallbackMatch("Could not assess fit automatically"));
    return;
  }

  await persistMatch(projectId, job.jobId, assessment);
}

/**
 * Assigns a match level to each newly-discovered job against the profile, using
 * the JD text the crawl already cached. Runs after the crawl so the list
 * populates fast; this pass fills in levels (replacing the `pending`
 * placeholder) with bounded concurrency, emitting `jobs.updated` per job so the
 * UI refreshes live. Pure LLM work — no browser.
 *
 * When there is no profile to compare against, every job gets a neutral
 * `partial` fallback rather than spinning on `pending` forever.
 */
export async function runMatchingPass(input: {
  projectId: string;
  profile: StructuredProfile | null;
  jobs: MatchPassJob[];
  modelSelection?: ChatModelSelection;
  signal?: AbortSignal;
}): Promise<void> {
  const { projectId, profile, jobs: pending, modelSelection, signal } = input;
  if (pending.length === 0) return;

  if (!profile) {
    for (const job of pending) {
      if (signal?.aborted) return;
      await persistMatch(projectId, job.jobId, fallbackMatch("No profile to compare against"));
      await writeProjectRuntimeEvent(projectId, "jobs.updated", { jobId: job.jobId });
    }
    return;
  }

  const concurrency = Math.max(1, Number.parseInt(process.env.MATCH_CONCURRENCY ?? "4", 10) || 4);
  logInfo("explorer match pass started", { projectId, jobs: pending.length, concurrency });

  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const job = pending[index];
      try {
        // Guard the codex call so workers don't race the shared token's
        // single-use refresh near expiry (no-op when the token is fresh).
        await withCodexAuthGuard(() => matchOne({ projectId, profile, job, modelSelection }));
      } catch (error) {
        logWarn("explorer match failed", {
          jobId: job.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        await persistMatch(projectId, job.jobId, fallbackMatch("Match failed")).catch(() => {});
      }
      await writeProjectRuntimeEvent(projectId, "jobs.updated", { jobId: job.jobId });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  logInfo("explorer match pass done", { projectId, jobs: pending.length });
}
