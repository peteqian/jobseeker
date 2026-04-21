import path from "node:path";
import { z } from "zod";
import {
  BrowserSession,
  buildDecisionPrompt,
  runAgent,
  type Decision,
  type FoundJob,
} from "@jobseeker/browser-agent";
import type { ExplorerFreshness, NavigationContext } from "@jobseeker/contracts";

import { dataDir } from "../../env";
import { createCodexThread, ensureCodexAuthInHome } from "../../lib/codex";
import { logInfo, logWarn } from "../../lib/log";
import { ensureCodexHomeDir, ensureScopeDir } from "../../lib/paths";
import {
  buildPairDirSlug,
  getLaunchOptions,
  getRetryLaunchOptions,
  isBotInterstitial,
} from "./browserLaunch";
import { computeFingerprint, extractUrlPattern } from "./fingerprint";
import {
  lookupPageMemory,
  markPageMemoryFailure,
  markPageMemorySuccess,
  savePageMemory,
} from "./memory";
import {
  buildAgentTask,
  clipPromptForLog,
  clipRawCodexOutput,
  summarizeStepParams,
  toDomainUrl,
} from "./prompting";
import { replayTrajectory } from "./replay";
import type { ExplorerProgress } from "./types";

const FOUND_JOB_SCHEMA = z.object({
  title: z.string().min(1),
  company: z.string().min(1).default("Unknown company"),
  location: z.string().min(1).default("Unknown location"),
  url: z.string().min(1),
  summary: z.string().min(1).default("No summary provided."),
  salary: z.string().nullable(),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const JSON_VALUE_SCHEMA: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JSON_VALUE_SCHEMA),
    z.object({}).catchall(JSON_VALUE_SCHEMA),
  ]),
);

const JSON_OBJECT_SCHEMA = z.object({}).catchall(JSON_VALUE_SCHEMA);
const NULLABLE_STRING_SCHEMA = z.string().nullable();
const NULLABLE_BOOLEAN_SCHEMA = z.boolean().nullable();

const EXTRACTOR_FIELD_ENTRY_SCHEMA = z.object({
  name: z.string().min(1),
  selector: z.string(),
  attr: z.string().nullable(),
});

const DECISION_WIRE_SCHEMA = z.object({
  thought: NULLABLE_STRING_SCHEMA,
  actions: z
    .array(
      z.object({
        name: z.string(),
        params: JSON_OBJECT_SCHEMA.default({}),
      }),
    )
    .max(5)
    .default([]),
  foundJobs: z.array(FOUND_JOB_SCHEMA),
  distilledTrajectory: z.union([
    z.object({
      actions: z.array(
        z.object({
          name: z.string(),
          paramsTemplate: JSON_OBJECT_SCHEMA.default({}),
        }),
      ),
      extractor: z.object({
        listingSelector: z.string(),
        fields: z.array(EXTRACTOR_FIELD_ENTRY_SCHEMA),
      }),
    }),
    z.null(),
  ]),
  done: z.boolean().default(false),
  summary: NULLABLE_STRING_SCHEMA,
  success: NULLABLE_BOOLEAN_SCHEMA,
});

export async function findJobsForQuery(input: {
  domain: string;
  query: string;
  freshness: ExplorerFreshness;
  maxJobs: number;
  navigation: NavigationContext;
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
  const task = buildAgentTask({
    domain: input.domain,
    freshness: input.freshness,
    maxJobs: input.maxJobs,
    navigation: input.navigation,
  });
  logInfo("explorer task built", {
    domain: input.domain,
    query: input.query,
    locationText: input.navigation.locationText,
    remotePreference: input.navigation.remotePreference,
  });
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

      const { fingerprint: landingFingerprint } = await computeFingerprint(page);
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

      const handle = createCodexThread({
        binaryPath: input.codexBinaryPath,
        model: input.model,
        reasoningEffort: input.effort,
        cwd: codexCwd,
        codexHome,
      });
      logInfo("explorer codex thread ready", {
        domain: input.domain,
        query: input.query,
        model: input.model,
        effort: input.effort,
        schemaNotes: {
          foundJobUrl: "plain-string",
          extractorFields: "entry-array-normalized-post-parse",
          optionalFields: "required-plus-nullable",
        },
        retry,
      });

      return await runAgent({
        task,
        signal: input.signal,
        session,
        page,
        maxSteps,
        decide: async (decisionInput) => {
          const prompt = buildDecisionPrompt(decisionInput);
          logInfo("explorer codex turn start", {
            domain: input.domain,
            query: input.query,
            step: decisionInput.step,
            promptChars: prompt.length,
            historyCount: decisionInput.history.length,
            retry,
          });
          let parsed: z.infer<typeof DECISION_WIRE_SCHEMA>;
          let finalResponse: string;
          try {
            ({ parsed, finalResponse } = await handle.runTurn({
              prompt,
              schema: DECISION_WIRE_SCHEMA,
              signal: input.signal,
            }));
          } catch (error) {
            logWarn("explorer codex turn failed", {
              domain: input.domain,
              query: input.query,
              step: decisionInput.step,
              promptChars: prompt.length,
              promptPreview: clipPromptForLog(prompt),
              retry,
              error,
            });
            throw error;
          }
          logInfo("explorer codex turn completed", {
            domain: input.domain,
            query: input.query,
            step: decisionInput.step,
            responseChars: finalResponse.length,
            actionCount: parsed.actions.length,
            foundJobs: parsed.foundJobs?.length ?? 0,
            done: parsed.done,
            retry,
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
          return normalizeDecision(parsed);
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
      await session.close().catch(() => {});
    }
  };

  const pairSlug = buildPairDirSlug(input.domain, input.query);

  try {
    let result = await runOnce(getLaunchOptions(pairSlug), false);

    if (!result.success && isBotInterstitial(result.summary) && !input.signal.aborted) {
      logWarn("explorer query retry after anti-bot interstitial", {
        domain: input.domain,
        query: input.query,
        summary: result.summary,
      });
      result = await runOnce(getRetryLaunchOptions(pairSlug), true);
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
    const message = error instanceof Error ? error.message : String(error);
    if (input.signal.aborted || isAbortLikeError(error)) {
      logInfo("explorer query aborted", {
        domain: input.domain,
        query: input.query,
        reason: message,
      });
      return;
    }
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
    userDataDir: path.join(dataDir, "browser-profiles", `explorer-validate-${Date.now()}`),
    autoInstallBrowser: true,
  } as const;
  const session = await BrowserSession.launch(launchOptions);
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
    await session.close().catch(() => {});
  }
}

export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  const maybeName =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (maybeName === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("aborted") || normalized.includes("aborterror");
}

function normalizeDecision(parsed: z.infer<typeof DECISION_WIRE_SCHEMA>): Decision {
  return {
    thought: parsed.thought ?? undefined,
    actions: parsed.actions,
    foundJobs:
      parsed.foundJobs.length > 0
        ? parsed.foundJobs.map((job) => ({
            ...job,
            salary: job.salary ?? undefined,
          }))
        : undefined,
    distilledTrajectory: parsed.distilledTrajectory
      ? {
          actions: parsed.distilledTrajectory.actions,
          extractor: {
            listingSelector: parsed.distilledTrajectory.extractor.listingSelector,
            fields: Object.fromEntries(
              parsed.distilledTrajectory.extractor.fields.map((entry) => [
                entry.name,
                entry.attr !== null
                  ? { selector: entry.selector, attr: entry.attr }
                  : { selector: entry.selector },
              ]),
            ),
          },
        }
      : undefined,
    done: parsed.done,
    summary: parsed.summary ?? undefined,
    success: parsed.success ?? undefined,
  };
}
