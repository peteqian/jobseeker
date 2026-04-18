import { and, eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runAgent } from "@jobseeker/browser-agent";
import type {
  DomainMemory,
  ExplorerConfigRecord,
  ExplorerDomainConfig,
  ExplorerFreshness,
  JobMatch,
  StructuredProfile,
} from "@jobseeker/contracts";

import { dataDir } from "../env";
import { db } from "../db";
import { explorerConfigs, jobMatches, jobs, profiles } from "../db/schema";
import { makeId } from "../lib/ids";
import { logInfo, logWarn } from "../lib/log";
import { loadMemory, pickMemory } from "./explorerMemory";

const FOUND_JOB_SCHEMA = z.object({
  title: z.string().min(1),
  company: z.string().min(1).default("Unknown company"),
  location: z.string().min(1).default("Unknown location"),
  url: z.string().url(),
  summary: z.string().min(1).default("No summary provided."),
  salary: z.string().optional(),
});

const FOUND_JOBS_SCHEMA = z.object({
  jobs: z.array(FOUND_JOB_SCHEMA).default([]),
});

type FoundJob = z.infer<typeof FOUND_JOBS_SCHEMA>["jobs"][number];

export interface ExplorerProgress {
  phase: "query_started" | "query_finished" | "crawl_step" | "codex_raw";
  domain: string;
  query: string;
  currentQuery: number;
  totalQueries: number;
  jobsFound?: number;
  step?: number;
  url?: string;
  action?: string;
  params?: unknown;
  ok?: boolean;
  result?: string;
  retry?: boolean;
  raw?: string;
}

interface ExplorerRunOptions {
  onProgress?: (progress: ExplorerProgress) => void | Promise<void>;
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
  const memories = await loadMemory();
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

  const collected: FoundJob[] = [];
  let queriesRun = 0;
  const totalQueries = plannedRuns.length;

  for (const [index, run] of plannedRuns.entries()) {
    queriesRun += 1;
    await options?.onProgress?.({
      phase: "query_started",
      domain: run.domain.domain,
      query: run.query,
      currentQuery: index + 1,
      totalQueries,
    });

    const jobsForQuery = await findJobsForQuery({
      domain: run.domain.domain,
      query: run.query,
      freshness: run.domain.freshness,
      maxJobs: run.maxJobs,
      memory: pickMemory(memories, run.domain.domain),
      currentQuery: index + 1,
      totalQueries,
      onProgress: options?.onProgress,
    });
    collected.push(...jobsForQuery);

    await options?.onProgress?.({
      phase: "query_finished",
      domain: run.domain.domain,
      query: run.query,
      currentQuery: index + 1,
      totalQueries,
      jobsFound: jobsForQuery.length,
    });
  }

  const deduped = dedupeJobs(collected);
  const scored = scoreJobs(deduped, profile, projectId);

  await replaceExplorerJobs(projectId, scored);

  return {
    jobsCreated: scored.length,
    domainsProcessed: domains.length,
    queriesRun,
  };
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

async function findJobsForQuery(input: {
  domain: string;
  query: string;
  freshness: ExplorerFreshness;
  maxJobs: number;
  memory: DomainMemory | null;
  currentQuery: number;
  totalQueries: number;
  onProgress?: (progress: ExplorerProgress) => void | Promise<void>;
}): Promise<FoundJob[]> {
  const url = toDomainUrl(input.domain);
  const task = buildAgentTask(input);
  const launch = getLaunchOptions();
  const model = process.env.EXPLORER_MODEL ?? "gpt-5.3-codex";
  const effort = process.env.EXPLORER_EFFORT ?? "medium";
  const maxSteps = Number.parseInt(process.env.EXPLORER_MAX_STEPS ?? "40", 10) || 40;

  logInfo("explorer query started", {
    domain: input.domain,
    query: input.query,
    freshness: input.freshness,
    maxJobs: input.maxJobs,
    headless: launch.headless,
    channel: launch.channel,
    userDataDir: launch.userDataDir,
    proxyEnabled: Boolean(launch.proxyServer),
    extensionCount: launch.extensionPaths?.length ?? 0,
    locale: launch.locale,
    timezone: launch.timezoneId,
  });

  try {
    let result = await runAgent({
      task,
      startUrl: url,
      maxSteps,
      model,
      effort,
      launch,
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
          retry: false,
        });
      },
      onCodexOutput: ({ step, raw }) => {
        void input.onProgress?.({
          phase: "codex_raw",
          domain: input.domain,
          query: input.query,
          currentQuery: input.currentQuery,
          totalQueries: input.totalQueries,
          step,
          raw: clipRawCodexOutput(raw),
          retry: false,
        });
      },
    });

    if (!result.success && isBotInterstitial(result.summary)) {
      logWarn("explorer query retry after anti-bot interstitial", {
        domain: input.domain,
        query: input.query,
        summary: result.summary,
      });

      // Retry once with a fresh, non-headless profile to reduce challenge stickiness.
      result = await runAgent({
        task,
        startUrl: url,
        maxSteps,
        model,
        effort,
        launch: getRetryLaunchOptions(),
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
            retry: true,
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
            retry: true,
          });
        },
        onCodexOutput: ({ step, raw }) => {
          void input.onProgress?.({
            phase: "codex_raw",
            domain: input.domain,
            query: input.query,
            currentQuery: input.currentQuery,
            totalQueries: input.totalQueries,
            step,
            raw: clipRawCodexOutput(raw),
            retry: true,
          });
        },
      });
    }

    if (!result.success) {
      logWarn("explorer query failed", {
        domain: input.domain,
        query: input.query,
        summary: result.summary,
      });
      return [];
    }

    const parsed = parseFoundJobs(result.data);
    logInfo("explorer query completed", {
      domain: input.domain,
      query: input.query,
      jobsFound: parsed.length,
      steps: result.steps,
    });
    return parsed;
  } catch (error) {
    logWarn("explorer query crashed", {
      domain: input.domain,
      query: input.query,
      error,
    });
    return [];
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
  memory: DomainMemory | null;
}): string {
  const freshnessText = freshnessToText(input.freshness);
  const memoryBlock = formatMemory(input.memory);
  return `Find up to ${input.maxJobs} job postings on ${input.domain} for "${input.query}".
Prefer listings posted ${freshnessText}.
Return only currently visible, real job listings from this site.
For each job capture: title, company, location, url, summary, and salary when available.
${memoryBlock}
When done, call done(success=true, summary=..., data={"jobs":[...]}) with valid JSON.
If blocked, call done(success=false, summary=...).`;
}

function formatMemory(memory: DomainMemory | null): string {
  if (!memory) {
    return "Site memory: no domain-specific playbook. Use normal search and extract flow.";
  }

  const searchLine =
    memory.searchHints.length > 0
      ? `Search hints: ${memory.searchHints.join(" ")}`
      : "Search hints: none.";
  const extractLine =
    memory.extractHints.length > 0
      ? `Extract hints: ${memory.extractHints.join(" ")}`
      : "Extract hints: none.";
  const avoidLine =
    memory.avoidHints.length > 0 ? `Avoid: ${memory.avoidHints.join(" ")}` : "Avoid: none.";

  return `Site memory for ${memory.domain}. ${searchLine} ${extractLine} ${avoidLine}`;
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

function parseFoundJobs(data: unknown): FoundJob[] {
  const parsedObject = FOUND_JOBS_SCHEMA.safeParse(data);
  if (parsedObject.success) {
    return parsedObject.data.jobs;
  }

  // Some runs may return a direct array instead of { jobs: [...] }.
  const parsedArray = z.array(FOUND_JOB_SCHEMA).safeParse(data);
  if (parsedArray.success) {
    return parsedArray.data;
  }

  return [];
}

function dedupeJobs(jobsList: FoundJob[]): FoundJob[] {
  const byKey = new Map<string, FoundJob>();

  for (const job of jobsList) {
    const key = job.url.trim().toLowerCase();
    if (!key) continue;
    if (byKey.has(key)) continue;
    byKey.set(key, job);
  }

  return [...byKey.values()];
}

function scoreJobs(
  jobsList: FoundJob[],
  profile: StructuredProfile | null,
  projectId: string,
): Array<{
  job: {
    id: string;
    projectId: string;
    source: "explorer";
    title: string;
    company: string;
    location: string;
    url: string;
    summary: string;
    salary: string | null;
    createdAt: string;
  };
  match: JobMatch;
}> {
  return jobsList.map((job) => {
    const score = profile ? calculateScore(job, profile) : 0.5;
    const reasons = profile ? buildReasons(job, profile) : ["General match from explorer"];
    const gaps = profile ? buildGaps(job, profile) : [];
    const jobId = makeId("job");
    const createdAt = new Date().toISOString();

    return {
      job: {
        id: jobId,
        projectId,
        source: "explorer",
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        summary: job.summary,
        salary: job.salary ?? null,
        createdAt,
      },
      match: {
        jobId,
        projectId,
        score,
        reasons,
        gaps,
      },
    };
  });
}

function calculateScore(job: FoundJob, profile: StructuredProfile): number {
  const haystack = `${job.title} ${job.summary} ${job.company}`.toLowerCase();
  const roleTerms = profile.targeting.roles.map((role) => role.title.toLowerCase());
  const skillTerms = profile.skills.map((skill) => skill.name.toLowerCase()).slice(0, 12);
  const keywordTerms = profile.searchContext.effectiveKeywords.map((term) => term.toLowerCase());
  const locationTerms = profile.targeting.locations
    .flatMap((entry) => [entry.city, entry.state, entry.country])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const roleHit = roleTerms.some((term) => haystack.includes(term)) ? 0.35 : 0;
  const skillHits = skillTerms.filter((term) => haystack.includes(term)).length;
  const keywordHits = keywordTerms.filter((term) => haystack.includes(term)).length;
  const locationHit = locationTerms.some(
    (term) => job.location.toLowerCase().includes(term) || job.summary.toLowerCase().includes(term),
  )
    ? 0.1
    : 0;

  const skillScore = Math.min(0.3, skillHits * 0.05);
  const keywordScore = Math.min(0.2, keywordHits * 0.05);
  const base = 0.15;
  const total = base + roleHit + skillScore + keywordScore + locationHit;

  return Math.max(0.05, Math.min(0.98, Number(total.toFixed(2))));
}

function buildReasons(job: FoundJob, profile: StructuredProfile): string[] {
  const out: string[] = [];
  const haystack = `${job.title} ${job.summary}`.toLowerCase();

  for (const role of profile.targeting.roles.slice(0, 3)) {
    if (haystack.includes(role.title.toLowerCase())) {
      out.push(`Role alignment: ${role.title}`);
    }
  }

  for (const skill of profile.skills.slice(0, 6)) {
    if (haystack.includes(skill.name.toLowerCase())) {
      out.push(`Mentions skill: ${skill.name}`);
    }
  }

  if (out.length === 0) {
    out.push("General alignment based on search query and profile context");
  }

  return out.slice(0, 5);
}

function buildGaps(job: FoundJob, profile: StructuredProfile): string[] {
  const out: string[] = [];
  const haystack = `${job.title} ${job.summary}`.toLowerCase();

  const topSkills = profile.skills.slice(0, 6);
  const missingSkills = topSkills.filter((skill) => !haystack.includes(skill.name.toLowerCase()));

  if (missingSkills.length >= 3) {
    out.push("Key profile skills are not clearly mentioned in this listing");
  }

  const wantsRemote = profile.targeting.locations.some((entry) => entry.remote === "full");
  const jobMentionsRemote =
    haystack.includes("remote") || job.location.toLowerCase().includes("remote");
  if (wantsRemote && !jobMentionsRemote) {
    out.push("Remote preference may not match this role");
  }

  return out.slice(0, 3);
}

async function replaceExplorerJobs(
  projectId: string,
  scored: Array<{
    job: {
      id: string;
      projectId: string;
      source: "explorer";
      title: string;
      company: string;
      location: string;
      url: string;
      summary: string;
      salary: string | null;
      createdAt: string;
    };
    match: JobMatch;
  }>,
) {
  const existingExplorerJobs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.projectId, projectId), eq(jobs.source, "explorer")))
    .all();

  for (const row of existingExplorerJobs) {
    await db.delete(jobMatches).where(eq(jobMatches.jobId, row.id));
  }

  await db.delete(jobs).where(and(eq(jobs.projectId, projectId), eq(jobs.source, "explorer")));

  if (scored.length === 0) {
    return;
  }

  await db.insert(jobs).values(scored.map((entry) => entry.job));
  await db.insert(jobMatches).values(
    scored.map((entry) => ({
      jobId: entry.match.jobId,
      projectId: entry.match.projectId,
      score: entry.match.score,
      reasonsJson: JSON.stringify(entry.match.reasons),
      gapsJson: JSON.stringify(entry.match.gaps),
    })),
  );
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
