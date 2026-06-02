import {
  AgentController,
  createCodexCliDecide,
  runTask,
  type GetNextActionFn,
} from "@peteqian/browser-agent-sdk";

import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";

import { acquireBrowserSession, realChromeExecutable } from "../../lib/browserSession";
import { logInfo, logWarn } from "../../lib/log";
import { extractBodyText } from "../../lib/pageText";
import { browserProfileDir, ensureScopeDir } from "../../lib/paths";
import { buildApplyActions } from "./actions";
import { answersMap, upsertAnswer } from "./answers";
import { applyMinScore, assessFit } from "./fit";
import { buildApplyTask } from "./prompting";

export type ApplyResult =
  | { status: "awaiting_submit"; score: number; summary: string; steps: number }
  | { status: "skipped_low_fit"; score: number; reasons: string[] }
  | { status: "skipped_fit_unknown" }
  | { status: "failed"; reason: string };

export interface RunApplyInput {
  projectId: string;
  projectSlug: string;
  jobUrl: string;
  profile: StructuredProfile;
  model: string;
  effort: string;
  codexBinaryPath: string;
  codexAuthHome: string;
  signal: AbortSignal;
  /** Provider/model for the fit judge. Defaults to codex-then-claude. */
  modelSelection?: ChatModelSelection;
  /** Override the fit cutoff. Defaults to APPLY_MIN_SCORE (70). */
  minScore?: number;
}

/**
 * Applies to one job on a logged-in SEEK session, human-gated.
 *
 * Flow: open the role, judge fit, and stop early if it is below the cutoff.
 * Otherwise run the agent to open Apply and fill the form from the answer
 * store, then pause via `request_human_submit` — the browser is left open for
 * the person to review and submit. The agent never submits.
 *
 * Login is reused from the shared persistent browser profile; the user signs in
 * by hand once in the visible window. We never handle passwords.
 */
export async function runApply(input: RunApplyInput): Promise<ApplyResult> {
  const userDataDir = browserProfileDir();
  const { session, owned } = await acquireBrowserSession({
    channel: (process.env.EXPLORER_BROWSER_CHANNEL as "chrome" | "chromium" | "msedge") ?? "chrome",
    headless: false,
    userDataDir,
    fingerprintMode: "native",
    executablePath: realChromeExecutable(),
    autoInstallBrowser: true,
  });

  try {
    const page = await session.newPage();
    await page.goto(input.jobUrl);
    await page.waitForStablePage(3_000).catch(() => {});
    if (input.signal.aborted) return { status: "failed", reason: "aborted" };

    const roleText = await extractBodyText(page);
    const fit = await assessFit({
      roleText,
      profile: input.profile,
      modelSelection: input.modelSelection,
    });
    if (!fit) {
      logWarn("apply skipped: fit unknown", { jobUrl: input.jobUrl });
      return { status: "skipped_fit_unknown" };
    }
    const cutoff = input.minScore ?? applyMinScore();
    if (fit.score < cutoff) {
      logInfo("apply skipped: low fit", { jobUrl: input.jobUrl, score: fit.score, cutoff });
      return { status: "skipped_low_fit", score: fit.score, reasons: fit.reasons };
    }

    const codexCwd = ensureScopeDir(input.projectSlug, "apply");
    // Run against the user's real Codex home (defaults to ~/.codex via provider
    // settings) so it reuses their existing `codex login`; a copied per-run home
    // stales its single-use refresh token.
    const codexHome = input.codexAuthHome?.trim() ? input.codexAuthHome : undefined;
    const decide = createCodexCliDecide({
      binaryPath: input.codexBinaryPath,
      model: input.model,
      effort: input.effort,
      cwd: codexCwd,
      codexHome,
    });

    // The SDK loop has no max-step option, so cap it here (mirrors explorer).
    const maxSteps = Number.parseInt(process.env.APPLY_MAX_STEPS ?? "60", 10) || 60;
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

    const controller = new AgentController();
    let reviewSummary = "";
    const actions = buildApplyActions({
      signal: input.signal,
      answers: await answersMap(input.projectId),
      recordDraft: (questionKey, answer) =>
        upsertAnswer({ projectId: input.projectId, questionKey, answer, source: "agent_draft" }),
      onReviewRequested: (summary) => {
        reviewSummary = summary;
      },
      controller,
    });

    const result = await runTask({
      task: buildApplyTask(),
      session,
      page,
      getNextAction: guardedDecide,
      actions,
      control: controller,
      signal: input.signal,
      onStep: (step) => {
        logInfo("apply step", {
          step: step.step,
          url: step.url,
          action: step.action.name,
          ok: step.result.ok,
        });
      },
    });

    if (controller.stopReason === "awaiting_human_submit") {
      logInfo("apply awaiting human submit", { jobUrl: input.jobUrl, score: fit.score });
      // Intentionally leave the browser open so the person can submit.
      return {
        status: "awaiting_submit",
        score: fit.score,
        summary: reviewSummary,
        steps: result.steps,
      };
    }

    if (owned) await session.close().catch(() => {});
    return { status: "failed", reason: result.summary || "Agent ended without requesting review." };
  } catch (error) {
    if (owned) await session.close().catch(() => {});
    const reason = error instanceof Error ? error.message : String(error);
    logWarn("apply crashed", { jobUrl: input.jobUrl, error: reason });
    return { status: "failed", reason };
  }
}
