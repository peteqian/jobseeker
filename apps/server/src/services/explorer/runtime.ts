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
import { acquireBrowserSession } from "../../lib/browserSession";
import { logInfo, logWarn } from "../../lib/log";
import { ensureScopeDir } from "../../lib/paths";
import { buildExplorerActions } from "./actions";
import {
  getLaunchOptions,
  getRetryLaunchOptions,
  isBotInterstitial,
  isAuthFailure,
  isModelInfraFailure,
} from "./browserLaunch";
import { computeFingerprint, extractUrlPattern } from "./fingerprint";
import { waitForLogin } from "./loginGate";
import {
  findReusablePageMemory,
  recordPageMemoryFailure,
  recordPageMemorySuccess,
  savePageMemory,
} from "./memory";
import { buildAgentTask, clipRawCodexOutput, summarizeStepParams, toDomainUrl } from "./prompting";
import { fetchJobDescription } from "../match/fetchJobDescription";
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
  taskId: string;
  codexBinaryPath: string;
  codexAuthHome: string;
  signal: AbortSignal;
  onProgress?: (progress: ExplorerProgress) => void | Promise<void>;
  onFoundJob?: (job: FoundJob) => void | Promise<void>;
  /**
   * Called with each found job's full description text, fetched in the crawl's
   * own (logged-in) session so login-walled detail pages are readable. Lets the
   * caller cache it and skip a second, unauthenticated fetch at match time.
   */
  onJobDescription?: (url: string, text: string) => void | Promise<void>;
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
    // Run against the user's real Codex home (defaults to ~/.codex via provider
    // settings) so it reuses their existing `codex login` and refreshes the
    // token in place. A per-run home copied auth.json once and never refreshed,
    // staling its single-use refresh token ("refresh_token_reused").
    const codexHome = input.codexAuthHome?.trim() ? input.codexAuthHome : undefined;

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

    const { session, owned } = await acquireBrowserSession(launchOptions);
    // A login wall pauses the agent loop mid-step (the window stays open for the
    // user to sign in); on completion we close as usual and the persistent
    // profile keeps the session for the next query.

    try {
      const page = await session.newPage();
      await page.goto(url);
      await page.waitForStablePage(3_000).catch(() => {});

      // Record every reported listing's URL so we can fetch its full JD in this
      // logged-in session once the agent/replay is done (before the session
      // closes), then hand the text to the caller.
      const foundUrls = new Set<string>();
      const collect = async (job: FoundJob) => {
        foundUrls.add(job.url);
        await input.onFoundJob?.(job);
      };

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
            await collect(job);
          }
          await recordPageMemorySuccess(memory.id, replayResult.jobs.slice(0, 3));
          await fetchAndReportDescriptions(
            session,
            foundUrls,
            input.onJobDescription,
            input.signal,
          );
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

      // The CLI adapter threads `cwd` (read-only sandbox) and, when set, a
      // CODEX_HOME. We leave CODEX_HOME unset so codex uses the live ~/.codex
      // auth and refreshes its token in place.
      const decide = createCodexCliDecide({
        binaryPath: input.codexBinaryPath,
        model: input.model,
        effort: input.effort,
        cwd: codexCwd,
        codexHome,
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
        onFoundJob: collect,
        onLoginRequired: (reason) => {
          return input.onProgress?.({
            phase: "awaiting_login",
            domain: input.domain,
            query: input.query,
            currentQuery: input.currentQuery,
            totalQueries: input.totalQueries,
            message: `Sign in to ${input.domain} in the opened browser window, then click Continue. (${reason})`,
          });
        },
        waitForLogin: () => waitForLogin(input.taskId, input.signal),
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

      const taskResult = await runTask({
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
      await fetchAndReportDescriptions(session, foundUrls, input.onJobDescription, input.signal);
      return taskResult;
    } finally {
      // Never close a user-owned (CDP-connected) browser.
      if (owned) await session.close().catch(() => {});
    }
  };

  try {
    let result = await runOnce(getLaunchOptions(), false);

    // A genuine auth failure (dead/expired/reused Codex token) is the only case
    // where re-authenticating helps — surface that and stop.
    if (!result.success && isAuthFailure(result.summary)) {
      logWarn("explorer query failed: auth error", {
        domain: input.domain,
        query: input.query,
        summary: clipRawCodexOutput(result.summary),
      });
      await input.onProgress?.({
        phase: "blocked",
        domain: input.domain,
        query: input.query,
        currentQuery: input.currentQuery,
        totalQueries: input.totalQueries,
        message: "Codex auth failed — re-authenticate (run `codex login`), then run again.",
      });
      return;
    }

    // Any other model-layer failure (Codex CLI exited, rate limit, transient
    // model error) is not a page interstitial — relaunching the browser just
    // loops, and it is not an auth problem, so don't tell the user to re-login.
    // Log the real summary and stop this query; the run continues with others.
    if (!result.success && isModelInfraFailure(result.summary)) {
      logWarn("explorer query failed: model error", {
        domain: input.domain,
        query: input.query,
        summary: clipRawCodexOutput(result.summary),
      });
      return;
    }

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
 * Fetches each found job's full description in the crawl's own (logged-in)
 * session and reports it to the caller. Runs after the agent/replay finishes,
 * while the session is still open, so login-walled detail pages are readable —
 * which an unauthenticated match-time fetch could not reach. Bounded so a busy
 * results page doesn't open dozens of tabs at once; failures are skipped (the
 * caller keeps the listing summary as a fallback).
 */
async function fetchAndReportDescriptions(
  session: BrowserSession,
  urls: Set<string>,
  onJobDescription: ((url: string, text: string) => void | Promise<void>) | undefined,
  signal: AbortSignal,
): Promise<void> {
  if (!onJobDescription || urls.size === 0) return;
  const list = [...urls];
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.JD_FETCH_CONCURRENCY ?? "3", 10) || 3,
  );
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (signal.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      const url = list[index];
      const text = await fetchJobDescription(session, url);
      if (text) await onJobDescription(url, text);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));
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
