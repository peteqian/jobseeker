import path from "node:path";
import {
  BrowserSession,
  createCodexCliDecide,
  runTask,
  type GetNextActionFn,
} from "@peteqian/browser-agent-sdk";

import type { DistilledTrajectory, FoundJob } from "./jobTypes";
import type { ExplorerFreshness, NavigationContext } from "@jobseeker/contracts";

import { dataDir } from "../../env";
import { logInfo, logWarn } from "../../lib/log";
import { ensureCodexHomeDir, ensureScopeDir } from "../../lib/paths";
import { buildExplorerActions } from "./actions";
import {
  buildQueryProfileKey,
  getLaunchOptions,
  getRetryLaunchOptions,
  isBotInterstitial,
} from "./browserLaunch";
import { computeFingerprint, extractUrlPattern } from "./fingerprint";
import {
  findReusablePageMemory,
  recordPageMemoryFailure,
  recordPageMemorySuccess,
  savePageMemory,
} from "./memory";
import { buildAgentTask, clipRawCodexOutput, summarizeStepParams, toDomainUrl } from "./prompting";
import { replayTrajectory } from "./replay";
import type { ExplorerProgress } from "./types";

/**
 * Executes one explorer `(domain, query)` run against a real browser session.
 *
 * The function first attempts to replay a previously learned trajectory keyed
 * on the landing-page fingerprint. If that fast path fails, it falls back to a
 * Codex-backed agent loop and validates any newly distilled trajectory before
 * saving it for future cold runs.
 */
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
          reason: "aborted" as const,
          summary: "Aborted before fingerprint.",
          data: null,
          steps: 0,
        };
      }

      const { fingerprint: landingFingerprint } = await computeFingerprint(page);
      const memory = await findReusablePageMemory(landingFingerprint);
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
          await recordPageMemorySuccess(memory.id, replayResult.jobs.slice(0, 3));
          return {
            success: true,
            reason: "completed" as const,
            summary: `Replayed trajectory ${memory.id}.`,
            data: null,
            steps: 0,
          };
        }
        const nextStatus = await recordPageMemoryFailure(memory.id);
        logWarn("explorer replay failed", {
          domain: input.domain,
          query: input.query,
          reason: replayResult.reason,
          status: nextStatus,
        });
      }

      // Use the codex CLI adapter directly rather than `createDecide`: only the
      // CLI adapter threads `codexHome`/`cwd`, which give each (domain,query) run
      // its own isolated codex auth home and working dir (it copies auth from
      // `codexAuthHome` on first use).
      const decide = createCodexCliDecide({
        binaryPath: input.codexBinaryPath,
        model: input.model,
        effort: input.effort,
        cwd: codexCwd,
        codexHome,
        codexAuthHome: input.codexAuthHome,
        onRaw: (raw, step) => {
          void input.onProgress?.({
            phase: "codex_raw",
            domain: input.domain,
            query: input.query,
            currentQuery: input.currentQuery,
            totalQueries: input.totalQueries,
            step,
            raw: clipRawCodexOutput(raw),
            retry,
          });
        },
      });

      // The SDK loop has no max-step option, so enforce the explorer cap here:
      // once the step index passes the limit, short-circuit to a failed `done`.
      const guardedDecide: GetNextActionFn = async (decisionInput, sig) => {
        if (decisionInput.step > maxSteps) {
          return {
            actions: [
              {
                name: "done",
                params: { success: false, summary: `Reached max steps (${maxSteps})` },
              },
            ],
            done: true,
            success: false,
            summary: `Reached max steps (${maxSteps})`,
          };
        }
        return decide(decisionInput, sig);
      };

      const actions = buildExplorerActions({
        signal: input.signal,
        onFoundJob: input.onFoundJob,
        saveTrajectory: async (trajectory: DistilledTrajectory) => {
          if (input.signal.aborted) return { saved: false, reason: "aborted" };
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
            return { saved: false, reason: validated.reason };
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
          return { saved: true };
        },
      });

      logInfo("explorer agent ready", {
        domain: input.domain,
        query: input.query,
        model: input.model,
        effort: input.effort,
        retry,
      });

      return await runTask({
        task,
        signal: input.signal,
        session,
        page,
        getNextAction: guardedDecide,
        actions,
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
      });
    } finally {
      await session.close().catch(() => {});
    }
  };

  const pairSlug = buildQueryProfileKey(input.domain, input.query);

  try {
    let result = await runOnce(getLaunchOptions(pairSlug), false);

    if (
      !result.success &&
      result.reason !== "aborted" &&
      result.reason !== "stopped" &&
      isBotInterstitial(result.summary) &&
      !input.signal.aborted
    ) {
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

/**
 * Validates a distilled trajectory in an isolated browser profile before we
 * promote it to reusable page memory.
 *
 * Replaying on the mutated agent session would hide issues caused by cookies,
 * storage, or prior navigation state.
 */
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

/**
 * Normalizes the different abort/error shapes produced by browsers, SDKs, and
 * explicit `AbortController` usage into a single control-flow check.
 */
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
