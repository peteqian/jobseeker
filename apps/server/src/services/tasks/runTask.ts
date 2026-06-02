import type { ChatModelSelection, StartTaskInput } from "@jobseeker/contracts";

import { db } from "../../db";
import { resumeAnalyses } from "../../db/schema";
import { runCoachReview } from "../coach/review";
import { runExplorerDiscovery } from "../explorer";
import { readExplorerConfig } from "../explorer/config";
import { publishProjectRuntimeEvent, writeProjectRuntimeEvent } from "../runtimeEvents";
import type { ProviderStreamEvent } from "../../provider/types";
import { readProjectProfile } from "../projects/profile";
import { runAtsAnalysis } from "../ats/analysis";
import { runHrAnalysis } from "../hr/analysis";
import { buildAndSaveProfile, createQuestionCardsIfMissing } from "./resumeIngest";
import { runTailoringTask } from "./tailoring";
import { runReviewTask } from "./reviewTask";

export interface TaskRunResult {
  jobsCreated?: number;
  domainsProcessed?: number;
  queriesRun?: number;
}

/**
 * Dispatches a persisted task row to the implementation that actually performs
 * the work.
 *
 * Route handlers own task lifecycle bookkeeping; this module owns the task-type
 * specific side effects.
 */
export async function runTask(
  input: StartTaskInput,
  taskId: string,
  timestamp: string,
  signal: AbortSignal,
): Promise<TaskRunResult> {
  if (input.type === "resume_ingest") {
    await runResumeIngestTask(input.projectId, taskId, timestamp, input.modelSelection);
    return {};
  }

  if (input.type === "explorer_discovery") {
    return runExplorerDiscoveryTask(input.projectId, taskId, signal, input.modelSelection);
  }

  if (input.type === "coach_review") {
    if (!input.resumeDocId) return {};
    const focusArea = input.focusArea ?? "Overall resume";
    return runAnalysis(input.projectId, taskId, "coach", () =>
      runCoachReview({
        projectId: input.projectId,
        resumeDocId: input.resumeDocId!,
        focusArea,
        deep: input.deepReview,
        pastedJds: input.pastedJds,
        useExplorer: input.useExplorer,
        modelSelection: input.modelSelection,
        onEvent: makeDeltaEmitter(input.projectId, taskId, "coach"),
      }).then((review) => (review ? { claims: review.claims.length } : null)),
    );
  }

  if (input.type === "ats_analysis") {
    return runAnalysis(input.projectId, taskId, "ats", async () => {
      const result = await runAtsAnalysis({
        projectId: input.projectId,
        modelSelection: input.modelSelection,
        onEvent: makeDeltaEmitter(input.projectId, taskId, "ats"),
      });
      if (!result) return null;
      await persistResumeAnalysis(input.projectId, input.resumeDocId, "ats", result);
      return { score: result.score, issueCount: result.issues.length };
    });
  }

  if (input.type === "hr_analysis") {
    return runAnalysis(input.projectId, taskId, "hr", async () => {
      const result = await runHrAnalysis({
        projectId: input.projectId,
        modelSelection: input.modelSelection,
        onEvent: makeDeltaEmitter(input.projectId, taskId, "hr"),
      });
      if (!result) return null;
      await persistResumeAnalysis(input.projectId, input.resumeDocId, "hr", result);
      return { score: result.score, strengthCount: result.strengths.length };
    });
  }

  if (input.type === "apply_job") {
    if (!input.input) return {};
    // Emit an immediate "applying" event so the UI shows progress while the
    // agent works; jobId lets the client correlate events back to the role.
    await writeProjectRuntimeEvent(input.projectId, "task.progress", {
      taskId,
      taskType: "apply_job",
      jobId: input.jobId,
      phase: "applying",
    });
    const { runApplyForJob } = await import("../apply/service");
    const result = await runApplyForJob({
      projectId: input.projectId,
      jobUrl: input.input,
      modelSelection: input.modelSelection,
    });
    await writeProjectRuntimeEvent(input.projectId, "task.progress", {
      taskId,
      taskType: "apply_job",
      jobId: input.jobId,
      phase: result.status,
    });
    return {};
  }

  if (input.type === "resume_tailoring" || input.type === "cover_letter_tailoring") {
    await runTailoringTask({
      projectId: input.projectId,
      taskId,
      jobId: input.jobId,
      kind: input.type,
      modelSelection: input.modelSelection,
    });
    return {};
  }

  if (input.type === "tailoring_review") {
    // `input` carries which tailored doc to review.
    const kind =
      input.input === "cover_letter_tailoring" ? "cover_letter_tailoring" : "resume_tailoring";
    await runReviewTask({
      projectId: input.projectId,
      taskId,
      jobId: input.jobId,
      kind,
      modelSelection: input.modelSelection,
    });
    return {};
  }

  return {};
}

/**
 * Stores the full ATS/HR analysis so it can be shown in the resume page.
 * Keyed by (project, resume, kind) and upserted, so re-running an analysis on
 * the same resume replaces the prior result rather than accumulating rows.
 */
async function persistResumeAnalysis(
  projectId: string,
  resumeDocId: string | undefined,
  kind: "ats" | "hr",
  result: unknown,
): Promise<void> {
  if (!resumeDocId) return;
  const row = {
    projectId,
    resumeDocId,
    kind,
    resultJson: JSON.stringify(result),
    createdAt: new Date().toISOString(),
  };
  await db
    .insert(resumeAnalyses)
    .values(row)
    .onConflictDoUpdate({
      target: [resumeAnalyses.projectId, resumeAnalyses.resumeDocId, resumeAnalyses.kind],
      set: { resultJson: row.resultJson, createdAt: row.createdAt },
    });
}

type AnalysisKind = "coach" | "ats" | "hr";

/** Forwards provider stream events to live (non-persisted) analysis.delta events. */
function makeDeltaEmitter(projectId: string, taskId: string, kind: AnalysisKind) {
  return (event: ProviderStreamEvent) => {
    publishProjectRuntimeEvent(projectId, "analysis.delta", {
      taskId,
      kind,
      channel: event.type,
      text: event.type === "tool" ? event.label : event.text,
    });
  };
}

/**
 * Wraps an analysis run with persisted start/complete/fail events so the UI can
 * show a progress item per analysis. The streamed reasoning/answer flows through
 * the separate (ephemeral) analysis.delta events.
 */
async function runAnalysis(
  projectId: string,
  taskId: string,
  kind: AnalysisKind,
  run: () => Promise<Record<string, number> | null>,
): Promise<TaskRunResult> {
  await writeProjectRuntimeEvent(projectId, "analysis.started", { taskId, kind });
  try {
    const summary = await run();
    if (summary) {
      await writeProjectRuntimeEvent(projectId, "analysis.completed", { taskId, kind, ...summary });
    } else {
      await writeProjectRuntimeEvent(projectId, "analysis.failed", {
        taskId,
        kind,
        reason: "no_result",
      });
    }
  } catch (error) {
    await writeProjectRuntimeEvent(projectId, "analysis.failed", {
      taskId,
      kind,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  return {};
}

async function runResumeIngestTask(
  projectId: string,
  taskId: string,
  timestamp: string,
  modelSelection?: ChatModelSelection,
): Promise<void> {
  await buildAndSaveProfile(projectId, modelSelection);
  await createQuestionCardsIfMissing(projectId, taskId, timestamp);

  const profile = await readProjectProfile(projectId);
  const hasTargetRoles = (profile?.targeting.roles.length ?? 0) > 0;

  const explorerConfig = await readExplorerConfig(projectId);
  const hasEnabledDomains = explorerConfig.domains.some((d) => d.enabled);

  if (hasTargetRoles && hasEnabledDomains) {
    const { startTask } = await import("./startTask");
    void startTask({
      projectId,
      type: "explorer_discovery",
      modelSelection,
    }).catch(() => {});
  }
}

async function runExplorerDiscoveryTask(
  projectId: string,
  taskId: string,
  signal: AbortSignal,
  modelSelection?: ChatModelSelection,
): Promise<TaskRunResult> {
  return runExplorerDiscovery(projectId, {
    modelSelection,
    signal,
    taskId,
    onProgress: (progress) =>
      writeProjectRuntimeEvent(projectId, "task.progress", {
        taskId,
        taskType: "explorer_discovery",
        ...progress,
      }),
  });
}
