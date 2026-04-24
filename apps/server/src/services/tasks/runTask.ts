import type { ChatModelSelection, StartTaskInput } from "@jobseeker/contracts";

import { runCoachReview } from "../coach/review";
import { runExplorerDiscovery } from "../explorer";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
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
