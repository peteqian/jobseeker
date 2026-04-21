import { eq } from "drizzle-orm";
import type { FoundJob } from "@jobseeker/browser-agent";
import {
  deriveNavigationContext,
  deriveSearchIntent,
  type NavigationContext,
  type SearchIntent,
} from "@jobseeker/contracts";

import { db } from "../db";
import { projects } from "../db/schema";
import { logInfo, logWarn } from "../lib/log";
import { createProjectSlug } from "../lib/paths";
import { getProviderSettings } from "../lib/provider-settings";
import { readExplorerConfig, readExplorerProfile } from "./explorer/config";
import { deleteOldExplorerJobs, saveDiscoveredJob } from "./explorer/persist";
import { getEnabledDomains, getQueriesForDomain, type QuerySource } from "./explorer/queryPlanning";
import { findJobsForQuery, isAbortLikeError } from "./explorer/runtime";
import type { ExplorerRunOptions } from "./explorer/types";

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

  const searchIntent: SearchIntent | null = profile ? deriveSearchIntent(profile) : null;

  const plannedRuns: Array<{
    domain: (typeof domains)[number];
    query: string;
    source: QuerySource;
    maxJobs: number;
    navigation: NavigationContext;
  }> = [];
  for (const domain of domains) {
    const queries = getQueriesForDomain(domain, profile);
    if (queries.length === 0) {
      logInfo("explorer queries planned", {
        domain: domain.domain,
        count: 0,
        sources: {},
      });
      continue;
    }

    const sources: Record<string, number> = {};
    for (const entry of queries) {
      sources[entry.source] = (sources[entry.source] ?? 0) + 1;
    }
    logInfo("explorer queries planned", {
      domain: domain.domain,
      count: queries.length,
      sources,
    });

    const perQueryLimit = Math.max(1, Math.ceil(domain.jobLimit / queries.length));
    for (const entry of queries) {
      const navigation: NavigationContext = searchIntent
        ? deriveNavigationContext({
            intent: searchIntent,
            query: entry.query,
            freshness: domain.freshness,
            maxJobs: perQueryLimit,
          })
        : {
            query: entry.query,
            freshness: domain.freshness,
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
  let jobsCreated = 0;
  const totalQueries = plannedRuns.length;
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.EXPLORER_CONCURRENCY ?? "3", 10) || 3,
  );
  const timeoutMs = Math.max(
    10_000,
    Number.parseInt(process.env.EXPLORER_PAIR_TIMEOUT_MS ?? "180000", 10) || 180_000,
  );

  const processPair = async (run: (typeof plannedRuns)[number], index: number) => {
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
    const timer = setTimeout(() => {
      controller.abort(new Error(`explorer pair timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const persistFound = async (job: FoundJob) => {
      if (controller.signal.aborted) return;
      const result = await saveDiscoveredJob({ projectId, profile, job, seenUrls });
      if (!result) return;
      pairJobsFound += 1;
      jobsCreated += 1;
      await options?.onProgress?.({
        phase: "job_found",
        domain: run.domain.domain,
        query: run.query,
        currentQuery: index + 1,
        totalQueries,
        job,
        score: result.score,
        reasons: result.reasons,
        gaps: result.gaps,
      });
    };

    try {
      await findJobsForQuery({
        domain: run.domain.domain,
        query: run.query,
        freshness: run.domain.freshness,
        maxJobs: run.maxJobs,
        navigation: run.navigation,
        currentQuery: index + 1,
        totalQueries,
        model: agent.model,
        effort: agent.effort,
        projectSlug,
        codexBinaryPath: providerSettings.codex.binaryPath,
        codexAuthHome: providerSettings.codex.homePath,
        signal: controller.signal,
        onProgress: options?.onProgress,
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
      clearTimeout(timer);
    }

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
  );

  if (jobsCreated > 0) {
    await deleteOldExplorerJobs(projectId, runStartedAt);
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
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers: Array<Promise<void>> = [];
  const worker = async () => {
    while (true) {
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
