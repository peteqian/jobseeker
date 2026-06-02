import { eq } from "drizzle-orm";
import type { FoundJob } from "./explorer/jobTypes";
import type { NavigationContext } from "@jobseeker/contracts";

import { db } from "../db";
import { projects } from "../db/schema";
import { logInfo, logWarn } from "../lib/log";
import { createProjectSlug } from "../lib/paths";
import { getProviderSettings } from "../lib/provider-settings";
import { readExplorerConfig, readExplorerProfile } from "./explorer/config";
import { deleteOldExplorerJobs, saveDiscoveredJob } from "./explorer/persist";
import { getEnabledDomains, getSearchQueries, type QuerySource } from "./explorer/queryPlanning";
import { findJobsForQuery, isAbortLikeError } from "./explorer/runtime";
import type { ExplorerProgress, ExplorerRunOptions } from "./explorer/types";
import { runMatchingPass, type MatchPassJob } from "./match/runMatchingPass";

export type { ExplorerProgress, ExplorerRunOptions } from "./explorer/types";

function resolveExplorerModelSelection(selection?: ExplorerRunOptions["modelSelection"]): {
  model: string;
  effort: string;
} {
  const defaultModel = process.env.EXPLORER_MODEL ?? "gpt-5.3-codex";
  const defaultEffort = process.env.EXPLORER_EFFORT ?? "medium";

  if (selection?.provider !== "codex") {
    return { model: defaultModel, effort: defaultEffort };
  }

  return {
    model: selection.model || defaultModel,
    effort: selection.effort || defaultEffort,
  };
}

/**
 * Runs the explorer discovery workflow for one project.
 *
 * This entrypoint loads explorer config/profile state, derives the concrete
 * `(domain, query)` runs to execute, processes them with bounded concurrency,
 * persists job matches incrementally, and only retires stale explorer rows once
 * the new run has produced at least one replacement result.
 */
export async function runExplorerDiscovery(projectId: string): Promise<{
  jobsCreated: number;
  domainsProcessed: number;
  queriesRun: number;
}>;
export async function runExplorerDiscovery(
  projectId: string,
  options: ExplorerRunOptions,
): Promise<{
  jobsCreated: number;
  domainsProcessed: number;
  queriesRun: number;
}>;
export async function runExplorerDiscovery(
  projectId: string,
  options?: ExplorerRunOptions,
): Promise<{
  jobsCreated: number;
  domainsProcessed: number;
  queriesRun: number;
}> {
  if (options?.signal?.aborted) {
    return { jobsCreated: 0, domainsProcessed: 0, queriesRun: 0 };
  }

  const [config, profile] = await Promise.all([
    readExplorerConfig(projectId),
    readExplorerProfile(projectId),
  ]);
  const providerSettings = getProviderSettings();
  if (!providerSettings.codex.enabled) {
    logWarn("explorer skipped", { projectId, reason: "codex_provider_disabled" });
    return { jobsCreated: 0, domainsProcessed: 0, queriesRun: 0 };
  }
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return { jobsCreated: 0, domainsProcessed: 0, queriesRun: 0 };
  }
  const projectSlug = project.slug ?? createProjectSlug(project.title, project.id);
  const agent = resolveExplorerModelSelection(options?.modelSelection);
  const domains = getEnabledDomains(config.domains);
  if (domains.length === 0) {
    return { jobsCreated: 0, domainsProcessed: 0, queriesRun: 0 };
  }

  const { search } = config;
  const queries = getSearchQueries(search);
  if (queries.length === 0) {
    logInfo("explorer queries planned", { count: 0, reason: "no_roles" });
    return { jobsCreated: 0, domainsProcessed: 0, queriesRun: 0 };
  }
  const perQueryLimit = Math.max(1, Math.ceil(search.jobLimit / queries.length));

  const plannedRuns: Array<{
    domain: (typeof domains)[number];
    query: string;
    source: QuerySource;
    maxJobs: number;
    navigation: NavigationContext;
  }> = [];
  for (const domain of domains) {
    logInfo("explorer queries planned", { domain: domain.domain, count: queries.length });
    for (const entry of queries) {
      const navigation: NavigationContext = {
        query: entry.query,
        locationText: search.locationText,
        remotePreference: search.remotePreference,
        freshness: search.freshness,
        maxJobs: perQueryLimit,
      };
      plannedRuns.push({
        domain,
        query: entry.query,
        source: entry.source,
        maxJobs: perQueryLimit,
        navigation,
      });
    }
  }

  const runStartedAt = new Date().toISOString();
  const seenUrls = new Set<string>();
  // New jobs collected during the crawl, matched in a single pass afterwards so
  // the crawl stays fast and the costly full-JD reads run with bounded fan-out.
  const newJobs: MatchPassJob[] = [];
  let jobsCreated = 0;
  const totalQueries = plannedRuns.length;
  // Sequential (the default) runs one browser at a time; parallel fans out up
  // to EXPLORER_CONCURRENCY queries at once. Spawning many browser windows is
  // heavy, so the user opts into parallel explicitly via search config.
  const parallelWidth = Math.max(
    2,
    Number.parseInt(process.env.EXPLORER_CONCURRENCY ?? "4", 10) || 4,
  );
  const concurrency = search.runMode === "parallel" ? parallelWidth : 1;
  const timeoutMs = Math.max(
    10_000,
    Number.parseInt(process.env.EXPLORER_PAIR_TIMEOUT_MS ?? "180000", 10) || 180_000,
  );

  // Once a domain reports a login wall, every other query for it would hit the
  // same wall. Track blocked domains and forward the event so the UI can prompt
  // the user to sign in once in the persistent browser profile.
  const blockedDomains = new Set<string>();
  const handleProgress = async (progress: ExplorerProgress) => {
    if (progress.phase === "blocked") blockedDomains.add(progress.domain);
    await options?.onProgress?.(progress);
  };

  const processPair = async (run: (typeof plannedRuns)[number], index: number) => {
    if (options?.signal?.aborted) return;
    if (blockedDomains.has(run.domain.domain)) return;

    let pairJobsFound = 0;
    await options?.onProgress?.({
      phase: "query_started",
      domain: run.domain.domain,
      query: run.query,
      currentQuery: index + 1,
      totalQueries,
      model: agent.model,
      effort: agent.effort,
    });

    const controller = new AbortController();
    const abortPair = () => {
      controller.abort(options?.signal?.reason ?? new Error("explorer run interrupted"));
    };
    const timer = setTimeout(() => {
      controller.abort(new Error(`explorer pair timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (options?.signal?.aborted) {
      abortPair();
    } else {
      options?.signal?.addEventListener("abort", abortPair, { once: true });
    }

    const persistFound = async (job: FoundJob) => {
      if (controller.signal.aborted) return;
      const result = await saveDiscoveredJob({ projectId, job, seenUrls });
      if (!result) return;
      newJobs.push({
        jobId: result.jobId,
        url: result.url,
        title: job.title,
        company: job.company,
        location: job.location,
        summary: job.summary,
      });
      pairJobsFound += 1;
      jobsCreated += 1;
      // The match level is filled in by the post-crawl pass; the list shows the
      // job immediately as "pending" until then.
      await options?.onProgress?.({
        phase: "job_found",
        domain: run.domain.domain,
        query: run.query,
        currentQuery: index + 1,
        totalQueries,
        job,
      });
    };

    try {
      await findJobsForQuery({
        domain: run.domain.domain,
        query: run.query,
        freshness: run.navigation.freshness,
        maxJobs: run.maxJobs,
        navigation: run.navigation,
        currentQuery: index + 1,
        totalQueries,
        model: agent.model,
        effort: agent.effort,
        projectSlug,
        taskId: options?.taskId ?? "",
        codexBinaryPath: providerSettings.codex.binaryPath,
        codexAuthHome: providerSettings.codex.homePath,
        signal: controller.signal,
        onProgress: handleProgress,
        onFoundJob: persistFound,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted || isAbortLikeError(error)) {
        logInfo("explorer query aborted", {
          domain: run.domain.domain,
          query: run.query,
          error: message,
        });
      } else {
        logWarn("explorer query failed", {
          domain: run.domain.domain,
          query: run.query,
          error: message,
        });
      }
    } finally {
      options?.signal?.removeEventListener("abort", abortPair);
      clearTimeout(timer);
    }

    if (options?.signal?.aborted) return;

    await options?.onProgress?.({
      phase: "query_finished",
      domain: run.domain.domain,
      query: run.query,
      currentQuery: index + 1,
      totalQueries,
      jobsFound: pairJobsFound,
    });
  };

  await runWithConcurrency(
    plannedRuns.map((run, index) => () => processPair(run, index)),
    concurrency,
    options?.signal,
  );

  if (!options?.signal?.aborted && jobsCreated > 0) {
    await deleteOldExplorerJobs(projectId, runStartedAt);
  }

  // Read each new job's full description and assign a match level against the
  // profile. Runs after the crawl so results show fast, then levels fill in.
  if (!options?.signal?.aborted && newJobs.length > 0) {
    await runMatchingPass({
      projectId,
      profile,
      jobs: newJobs,
      modelSelection: options?.modelSelection,
      signal: options?.signal,
    });
  }

  return {
    jobsCreated,
    domainsProcessed: domains.length,
    queriesRun: totalQueries,
  };
}

/**
 * Small fixed-width worker pool used by explorer query execution.
 *
 * Explorer only needs bounded fan-out with stable result ordering, so this
 * local helper stays simpler than introducing a generic queue abstraction.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  signal?: AbortSignal,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers: Array<Promise<void>> = [];
  const worker = async () => {
    while (true) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  };
  for (let i = 0; i < Math.min(limit, tasks.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
