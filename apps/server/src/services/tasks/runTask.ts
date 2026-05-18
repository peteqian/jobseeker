import type { ChatModelSelection, StartTaskInput } from "@jobseeker/contracts";

import { runCoachReview } from "../coach/review";
import { runExplorerDiscovery } from "../explorer";
import { readExplorerConfig } from "../explorer/config";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { readProjectProfile } from "../projects/profile";
import { runAtsAnalysis } from "../ats/analysis";
import { runHrAnalysis } from "../hr/analysis";
import { buildAndSaveProfile, createQuestionCardsIfMissing } from "./resumeIngest";
import { runTailoringTask } from "./tailoring";

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
): Promise<TaskRunResult> {
  if (input.type === "resume_ingest") {
    await runResumeIngestTask(input.projectId, taskId, timestamp, input.modelSelection);
    return {};
  }

  if (input.type === "explorer_discovery") {
    return runExplorerDiscoveryTask(input.projectId, taskId, input.modelSelection);
  }

  if (input.type === "coach_review") {
    if (!input.resumeDocId) return {};
    const focusArea = input.focusArea ?? "Overall resume";
    await runCoachReview({
      projectId: input.projectId,
      resumeDocId: input.resumeDocId,
      focusArea,
      deep: input.deepReview,
      pastedJds: input.pastedJds,
      useExplorer: input.useExplorer,
      modelSelection: input.modelSelection,
    });
    return {};
  }

  if (input.type === "ats_analysis") {
    const result = await runAtsAnalysis({
      projectId: input.projectId,
      modelSelection: input.modelSelection,
    });
    if (result) {
      await writeProjectRuntimeEvent(input.projectId, "task.progress", {
        taskId,
        taskType: "ats_analysis",
        phase: "analysis_complete",
        score: result.score,
        issueCount: result.issues.length,
      });
    }
    return {};
  }

  if (input.type === "hr_analysis") {
    const result = await runHrAnalysis({
      projectId: input.projectId,
      modelSelection: input.modelSelection,
    });
    if (result) {
      await writeProjectRuntimeEvent(input.projectId, "task.progress", {
        taskId,
        taskType: "hr_analysis",
        phase: "analysis_complete",
        score: result.score,
        strengthCount: result.strengths.length,
        concernCount: result.concerns.length,
      });
    }
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
  modelSelection?: ChatModelSelection,
): Promise<TaskRunResult> {
  return runExplorerDiscovery(projectId, {
    modelSelection,
    onProgress: (progress) =>
      writeProjectRuntimeEvent(projectId, "task.progress", {
        taskId,
        taskType: "explorer_discovery",
        ...progress,
      }),
  });
}
