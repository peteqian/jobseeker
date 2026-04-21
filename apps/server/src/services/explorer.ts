import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  BrowserSession,
  buildDecisionPrompt,
  runAgent,
  type Decision,
} from "@jobseeker/browser-agent";
import type {
  ChatModelSelection,
  ExplorerConfigRecord,
  ExplorerDomainConfig,
  ExplorerFreshness,
  StructuredProfile,
} from "@jobseeker/contracts";

import { dataDir } from "../env";
import { db } from "../db";
import { explorerConfigs, profiles, projects } from "../db/schema";
import { createCodexThread, ensureCodexAuthInHome } from "../lib/codex";
import { logInfo, logWarn } from "../lib/log";
import { createProjectSlug, ensureCodexHomeDir, ensureScopeDir } from "../lib/paths";
import { getProviderSettings } from "../lib/provider-settings";
import { persistJobIncrementally, sweepStaleExplorerJobs, type FoundJob } from "./explorer/persist";
import { computeFingerprint, extractUrlPattern } from "./explorer/fingerprint";
import {
  lookupPageMemory,
  markPageMemoryFailure,
  markPageMemorySuccess,
  savePageMemory,
} from "./explorer/memory";
import { replayTrajectory } from "./explorer/replay";

const FOUND_JOB_SCHEMA = z.object({
  title: z.string().min(1),
  company: z.string().min(1).default("Unknown company"),
  location: z.string().min(1).default("Unknown location"),
  url: z.string().url(),
  summary: z.string().min(1).default("No summary provided."),
  salary: z.string().optional(),
});

export interface ExplorerProgress {
  phase: "query_started" | "query_finished" | "crawl_step" | "codex_raw" | "job_found";
  domain: string;
  query: string;
  currentQuery: number;
  totalQueries: number;
  model?: string;
  effort?: string;
  jobsFound?: number;
  step?: number;
  url?: string;
  action?: string;
  params?: unknown;
  ok?: boolean;
  result?: string;
  retry?: boolean;
  raw?: string;
  job?: FoundJob;
  score?: number;
  reasons?: string[];
  gaps?: string[];
}

interface ExplorerRunOptions {
  modelSelection?: ChatModelSelection;
  onProgress?: (progress: ExplorerProgress) => void | Promise<void>;
}

function resolveExplorerModelSelection(selection?: ChatModelSelection): {
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
    readProfile(projectId),
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
  const domains = getRunnableDomains(config.domains);
  if (domains.length === 0) {
    return { jobsCreated: 0, domainsProcessed: 0, queriesRun: 0 };
  }

  const plannedRuns: Array<{
    domain: ExplorerDomainConfig;
    query: string;
    maxJobs: number;
  }> = [];
  for (const domain of domains) {
    const queries = getQueriesForDomain(domain, profile);
    if (queries.length === 0) {
      continue;
    }

    const perQueryLimit = Math.max(1, Math.ceil(domain.jobLimit / queries.length));
    for (const query of queries) {
      plannedRuns.push({
        domain,
        query,
        maxJobs: perQueryLimit,
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
      const result = await persistJobIncrementally({ projectId, profile, job, seenUrls });
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
      logWarn("explorer query failed", {
        domain: run.domain.domain,
        query: run.query,
        error: error instanceof Error ? error.message : String(error),
      });
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

  // Only retire prior results once the current run produced at least one row. A fully
  // failed run leaves the last successful set in place.
  if (jobsCreated > 0) {
    await sweepStaleExplorerJobs(projectId, runStartedAt);
  }

  return {
    jobsCreated,
    domainsProcessed: domains.length,
    queriesRun: totalQueries,
  };
}

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

async function readExplorerConfig(projectId: string): Promise<ExplorerConfigRecord> {
  const row = await db
    .select()
    .from(explorerConfigs)
    .where(eq(explorerConfigs.projectId, projectId))
    .get();

  if (!row) {
    return {
      projectId,
      domains: [],
      includeAgentSuggestions: true,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    projectId,
    domains: normalizeDomainConfigs(JSON.parse(row.domainsJson)),
    includeAgentSuggestions: row.includeAgentSuggestions,
    updatedAt: row.updatedAt,
  };
}

async function readProfile(projectId: string): Promise<StructuredProfile | null> {
  const row = await db.select().from(profiles).where(eq(profiles.projectId, projectId)).get();
  if (!row) return null;
  return JSON.parse(row.profileJson) as StructuredProfile;
}

function getRunnableDomains(domains: ExplorerDomainConfig[]): ExplorerDomainConfig[] {
  return domains.filter((domain) => domain.enabled);
}

function getQueriesForDomain(
  domain: ExplorerDomainConfig,
  profile: StructuredProfile | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const query of domain.queries) {
    const value = query.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  if (out.length > 0) {
    return out;
  }

  if (!profile) {
    return [];
  }

  // Fallback to profile roles when a domain has no explicit queries.
  for (const role of profile.targeting.roles) {
    const value = role.title.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 3) break;
  }

  return out;
}

const DECISION_SCHEMA = z.object({
  thought: z.string().optional(),
  actions: z
    .array(
      z.object({
        name: z.string(),
        params: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(5)
    .default([]),
  foundJobs: z.array(FOUND_JOB_SCHEMA).optional(),
  distilledTrajectory: z
    .object({
      actions: z.array(
        z.object({
          name: z.string(),
          paramsTemplate: z.record(z.string(), z.unknown()).default({}),
        }),
      ),
      extractor: z.object({
        listingSelector: z.string(),
        fields: z.record(
          z.string(),
          z.object({
            selector: z.string(),
            attr: z.string().optional(),
          }),
        ),
      }),
    })
    .optional(),
  done: z.boolean().default(false),
  summary: z.string().optional(),
  success: z.boolean().optional(),
});

async function findJobsForQuery(input: {
  domain: string;
  query: string;
  freshness: ExplorerFreshness;
  maxJobs: number;
  currentQuery: number;
  totalQueries: number;
  model: string;
  effort: string;
  projectSlug: string;
  codexBinaryPath: string;
  codexAuthHome: string;
  signal: AbortSignal;
  onProgress?: (progress: ExplorerProgress) => void | Promise<void>;
  onFoundJob?: (job: FoundJob) => void | Promise<void>;
}): Promise<void> {
  const url = toDomainUrl(input.domain);
  const task = buildAgentTask(input);
  const maxSteps = Number.parseInt(process.env.EXPLORER_MAX_STEPS ?? "40", 10) || 40;
  const urlPattern = extractUrlPattern(url);

  const runOnce = async (launchOptions: ReturnType<typeof getLaunchOptions>, retry: boolean) => {
    const codexCwd = ensureScopeDir(input.projectSlug, "explorer");
    const codexHome = ensureCodexHomeDir(input.projectSlug, "explorer", `explorer_${input.domain}`);
    ensureCodexAuthInHome(codexHome, input.codexAuthHome);

    logInfo("explorer query started", {
      domain: input.domain,
      query: input.query,
      freshness: input.freshness,
      maxJobs: input.maxJobs,
      model: input.model,
      effort: input.effort,
      retry,
      headless: launchOptions.headless,
      channel: launchOptions.channel,
      userDataDir: launchOptions.userDataDir,
      proxyEnabled: Boolean(launchOptions.proxyServer),
      extensionCount: launchOptions.extensionPaths?.length ?? 0,
      locale: launchOptions.locale,
      timezone: launchOptions.timezoneId,
    });

    const session = await BrowserSession.launch(launchOptions);
    const abortCloser = () => {
      void session.close().catch(() => {});
    };
    input.signal.addEventListener("abort", abortCloser, { once: true });

    try {
      const page = await session.newPage();
      await page.goto(url);
      await page.waitForStablePage(3_000).catch(() => {});

      if (input.signal.aborted) {
        return {
          success: false,
          summary: "Aborted before fingerprint.",
          data: null,
          steps: 0,
        };
      }

      // Fingerprint the LANDING page. Memory is keyed on this hash so lookup and
      // save use the same DOM state.
      const { fingerprint: landingFingerprint } = await computeFingerprint(page);

      // Fast path: replay trusted/untrusted trajectory keyed on landing fingerprint.
      const memory = await lookupPageMemory(landingFingerprint);
      if (memory) {
        logInfo("explorer page memory hit", {
          domain: input.domain,
          query: input.query,
          memoryId: memory.id,
          status: memory.status,
          fingerprint: landingFingerprint,
        });
        const replayResult = await replayTrajectory({
          page,
          trajectory: memory.trajectory,
          query: input.query,
          signal: input.signal,
        });
        if (replayResult.success && replayResult.jobs.length > 0) {
          for (const job of replayResult.jobs) {
            if (input.signal.aborted) break;
            await input.onFoundJob?.(job);
          }
          await markPageMemorySuccess(memory.id, replayResult.jobs.slice(0, 3));
          return {
            success: true,
            summary: `Replayed trajectory ${memory.id}.`,
            data: null,
            steps: 0,
          };
        }
        const nextStatus = await markPageMemoryFailure(memory.id);
        logWarn("explorer replay failed", {
          domain: input.domain,
          query: input.query,
          reason: replayResult.reason,
          status: nextStatus,
        });
      }

      // Cold path: agent discovery with structured output.
      const handle = createCodexThread({
        binaryPath: input.codexBinaryPath,
        model: input.model,
        reasoningEffort: input.effort,
        cwd: codexCwd,
        codexHome,
      });

      return await runAgent({
        task,
        session,
        page,
        maxSteps,
        decide: async (decisionInput) => {
          const prompt = buildDecisionPrompt(decisionInput);
          const { parsed, finalResponse } = await handle.runTurn({
            prompt,
            schema: DECISION_SCHEMA,
            signal: input.signal,
          });
          void input.onProgress?.({
            phase: "codex_raw",
            domain: input.domain,
            query: input.query,
            currentQuery: input.currentQuery,
            totalQueries: input.totalQueries,
            step: decisionInput.step,
            raw: clipRawCodexOutput(finalResponse),
            retry,
          });
          return parsed as Decision;
        },
        onStep: (step) => {
          logInfo("explorer crawl step", {
            domain: input.domain,
            query: input.query,
            step: step.step,
            url: step.url,
            action: step.action.name,
            params: summarizeStepParams(step.action.params),
            ok: step.result.ok,
            result: step.result.message,
            retry,
          });
          void input.onProgress?.({
            phase: "crawl_step",
            domain: input.domain,
            query: input.query,
            currentQuery: input.currentQuery,
            totalQueries: input.totalQueries,
            step: step.step,
            url: step.url,
            action: step.action.name,
            params: summarizeStepParams(step.action.params),
            ok: step.result.ok,
            result: step.result.message,
            retry,
          });
        },
        onFoundJobs: async (jobs) => {
          for (const job of jobs) {
            if (input.signal.aborted) break;
            await input.onFoundJob?.(job);
          }
        },
        onDistilledTrajectory: async (trajectory) => {
          if (input.signal.aborted) return;
          // Validate on a fresh session — the agent just mutated the primary page,
          // so replaying there is meaningless. A fresh userDataDir + fresh goto
          // mirrors what a future cold run would see.
          const validated = await validateTrajectoryOnFreshSession({
            trajectory,
            query: input.query,
            startUrl: url,
            signal: input.signal,
          });
          if (!validated.success) {
            logWarn("explorer distilled trajectory validation failed", {
              domain: input.domain,
              query: input.query,
              reason: validated.reason,
            });
            return;
          }
          await savePageMemory({
            fingerprint: landingFingerprint,
            urlPattern,
            trajectory,
            sampleJobs: validated.jobs.slice(0, 3),
          });
          logInfo("explorer saved page memory", {
            domain: input.domain,
            query: input.query,
            fingerprint: landingFingerprint,
            sampleJobs: validated.jobs.length,
          });
        },
      });
    } finally {
      input.signal.removeEventListener("abort", abortCloser);
      await session.close().catch(() => {});
    }
  };

  try {
    let result = await runOnce(getLaunchOptions(), false);

    if (!result.success && isBotInterstitial(result.summary) && !input.signal.aborted) {
      logWarn("explorer query retry after anti-bot interstitial", {
        domain: input.domain,
        query: input.query,
        summary: result.summary,
      });
      result = await runOnce(getRetryLaunchOptions(), true);
    }

    if (!result.success) {
      logWarn("explorer query failed", {
        domain: input.domain,
        query: input.query,
        summary: result.summary,
      });
      return;
    }

    logInfo("explorer query completed", {
      domain: input.domain,
      query: input.query,
      steps: result.steps,
    });
  } catch (error) {
    logWarn("explorer query crashed", {
      domain: input.domain,
      query: input.query,
      error,
    });
  }
}

async function validateTrajectoryOnFreshSession(input: {
  trajectory: Parameters<typeof replayTrajectory>[0]["trajectory"];
  query: string;
  startUrl: string;
  signal: AbortSignal;
}): ReturnType<typeof replayTrajectory> {
  const launchOptions = {
    channel: (process.env.EXPLORER_BROWSER_CHANNEL as "chrome" | "chromium" | "msedge") ?? "chrome",
    headless: true,
    // Fresh profile dir so cookies/storage from the agent's primary session don't
    // make an unvisited site "look logged in" during validation.
    userDataDir: path.join(dataDir, "browser-profiles", `explorer-validate-${Date.now()}`),
    autoInstallBrowser: true,
  } as const;
  const session = await BrowserSession.launch(launchOptions);
  const abortCloser = () => {
    void session.close().catch(() => {});
  };
  input.signal.addEventListener("abort", abortCloser, { once: true });
  try {
    const page = await session.newPage();
    await page.goto(input.startUrl);
    await page.waitForStablePage(3_000).catch(() => {});
    return await replayTrajectory({
      page,
      trajectory: input.trajectory,
      query: input.query,
      signal: input.signal,
    });
  } catch (error) {
    return {
      success: false,
      jobs: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    input.signal.removeEventListener("abort", abortCloser);
    await session.close().catch(() => {});
  }
}

function getLaunchOptions() {
  const userDataDir = path.join(dataDir, "browser-profiles", "explorer-primary");
  const extensionPaths = readExtensionPathsFromEnv();
  return {
    // Default to real Chrome and non-headless for better anti-bot posture.
    channel: (process.env.EXPLORER_BROWSER_CHANNEL as "chrome" | "chromium" | "msedge") ?? "chrome",
    headless: process.env.EXPLORER_HEADLESS === "true",
    userDataDir,
    proxyServer: process.env.EXPLORER_PROXY_SERVER,
    proxyBypass: process.env.EXPLORER_PROXY_BYPASS,
    userAgent: process.env.EXPLORER_USER_AGENT,
    acceptLanguage: process.env.EXPLORER_ACCEPT_LANGUAGE,
    locale: process.env.EXPLORER_LOCALE,
    timezoneId: process.env.EXPLORER_TIMEZONE,
    extensionPaths,
    autoInstallBrowser: true,
  } as const;
}

function getRetryLaunchOptions() {
  const userDataDir = path.join(dataDir, "browser-profiles", "explorer-retry");
  const extensionPaths = readExtensionPathsFromEnv();
  return {
    channel: (process.env.EXPLORER_BROWSER_CHANNEL as "chrome" | "chromium" | "msedge") ?? "chrome",
    headless: false,
    userDataDir,
    proxyServer: process.env.EXPLORER_PROXY_SERVER,
    proxyBypass: process.env.EXPLORER_PROXY_BYPASS,
    userAgent: process.env.EXPLORER_USER_AGENT,
    acceptLanguage: process.env.EXPLORER_ACCEPT_LANGUAGE,
    locale: process.env.EXPLORER_LOCALE,
    timezoneId: process.env.EXPLORER_TIMEZONE,
    extensionPaths,
    autoInstallBrowser: true,
  } as const;
}

function readExtensionPathsFromEnv(): string[] {
  const raw = process.env.EXPLORER_EXTENSION_PATHS;
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && existsSync(value));
}

function isBotInterstitial(summary: string): boolean {
  const text = summary.toLowerCase();
  return (
    text.includes("just a moment") ||
    text.includes("anti-bot") ||
    text.includes("captcha") ||
    text.includes("challenge")
  );
}

function summarizeStepParams(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }

  const record = params as Record<string, unknown>;
  const copy: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      copy[key] = value.length > 160 ? `${value.slice(0, 160)}...` : value;
      continue;
    }

    if (Array.isArray(value)) {
      copy[key] = value.slice(0, 5);
      continue;
    }

    copy[key] = value;
  }

  return copy;
}

function clipRawCodexOutput(raw: string): string {
  const maxChars = Number.parseInt(process.env.EXPLORER_RAW_LOG_MAX_CHARS ?? "12000", 10) || 12000;
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, maxChars)}\n... [truncated ${raw.length - maxChars} chars]`;
}

function buildAgentTask(input: {
  domain: string;
  query: string;
  freshness: ExplorerFreshness;
  maxJobs: number;
}): string {
  const freshnessText = freshnessToText(input.freshness);
  return `Find up to ${input.maxJobs} job postings on ${input.domain} for "${input.query}".
Prefer listings posted ${freshnessText}.
Return only currently visible, real job listings from this site.
Emit each job via foundJobs as soon as you can see its title, company, and URL.
Set done=true with success=true when you have enough listings, or success=false with a summary if blocked.`;
}

function freshnessToText(freshness: ExplorerFreshness): string {
  if (freshness === "24h") return "within the last 24 hours";
  if (freshness === "week") return "within the last week";
  if (freshness === "month") return "within the last month";
  return "at any time";
}

function toDomainUrl(domain: string): string {
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "");
  return `https://${clean}`;
}

function normalizeDomainConfigs(input: unknown): ExplorerConfigRecord["domains"] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          domain: entry,
          enabled: true,
          jobLimit: 25,
          freshness: "week" as const,
          queries: [],
        };
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const domain = typeof record.domain === "string" ? record.domain : null;
        if (!domain) return null;

        const queriesSource = Array.isArray(record.queries)
          ? record.queries
          : Array.isArray(record.queryIds)
            ? record.queryIds
            : [];

        return {
          domain,
          enabled: record.enabled !== false,
          jobLimit: typeof record.jobLimit === "number" ? record.jobLimit : 25,
          freshness:
            record.freshness === "24h" ||
            record.freshness === "week" ||
            record.freshness === "month" ||
            record.freshness === "any"
              ? record.freshness
              : "week",
          queries: queriesSource.filter((value): value is string => typeof value === "string"),
        };
      }

      return null;
    })
    .filter((entry): entry is ExplorerConfigRecord["domains"][number] => entry !== null);
}
