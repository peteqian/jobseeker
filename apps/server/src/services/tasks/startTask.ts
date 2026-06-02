import { eq } from "drizzle-orm";
import type { StartTaskInput, TaskRecord } from "@jobseeker/contracts";

import { db } from "../../db";
import { tasks } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { logError, logInfo } from "../../lib/log";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { runTask } from "./runTask";

const now = () => new Date().toISOString();

const activeTasks = new Map<string, AbortController>();

export async function interruptTask(taskId: string): Promise<boolean> {
  const controller = activeTasks.get(taskId);
  if (controller) {
    if (!controller.signal.aborted) {
      controller.abort(new Error("Task interrupted"));
    }
    return true;
  }

  // Task is not active in memory; check if it is a stale DB entry.
  const [staleTask] = await db.select().from(tasks).where(eq(tasks.id, taskId));

  if (staleTask && (staleTask.status === "running" || staleTask.status === "queued")) {
    const timestamp = now();
    await db
      .update(tasks)
      .set({
        status: "interrupted",
        updatedAt: timestamp,
        error: "Task interrupted after server restart",
      })
      .where(eq(tasks.id, taskId));

    await writeProjectRuntimeEvent(staleTask.projectId, "task.interrupted", {
      taskId: staleTask.id,
      taskType: staleTask.type,
      jobId: null,
    });

    logInfo("interrupted stale task", { taskId, type: staleTask.type });
    return true;
  }

  return false;
}

/**
 * Inserts a task row, writes a task.started runtime event, and fires the
 * execution in the background. Returns the persisted task shape.
 *
 * Used by both the POST /api/tasks route and auto-triggers (e.g. resume
 * upload → coach_review).
 */
export async function startTask(input: StartTaskInput): Promise<TaskRecord> {
  const timestamp = now();
  const taskId = makeId("task");
  const taskStatus: TaskRecord["status"] = "running";
  const controller = new AbortController();

  await db.insert(tasks).values({
    id: taskId,
    projectId: input.projectId,
    type: input.type,
    status: taskStatus,
    providerTurnId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    error: null,
  });

  await writeProjectRuntimeEvent(input.projectId, "task.started", {
    taskId,
    taskType: input.type,
    jobId: input.jobId ?? null,
    status: "running",
  });

  logInfo("task started", {
    taskId,
    projectId: input.projectId,
    type: input.type,
  });

  activeTasks.set(taskId, controller);
  void executeTask(input, taskId, timestamp, controller.signal);

  return {
    id: taskId,
    projectId: input.projectId,
    type: input.type,
    status: taskStatus,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function executeTask(
  input: StartTaskInput,
  taskId: string,
  timestamp: string,
  signal: AbortSignal,
): Promise<void> {
  let taskStatus: TaskRecord["status"] = "running";
  let taskError: string | null = null;

  try {
    const result = await runTask(input, taskId, timestamp, signal);
    if (signal.aborted) {
      taskStatus = "interrupted";
      await writeProjectRuntimeEvent(input.projectId, "task.interrupted", {
        taskId,
        taskType: input.type,
        jobId: input.jobId ?? null,
      });
    } else {
      taskStatus = "completed";
      await writeProjectRuntimeEvent(input.projectId, "task.completed", {
        taskId,
        taskType: input.type,
        jobId: input.jobId ?? null,
      });
      if (input.type === "explorer_discovery") {
        await writeProjectRuntimeEvent(input.projectId, "jobs.updated", {
          taskId,
          jobsCreated: result.jobsCreated ?? 0,
          domainsProcessed: result.domainsProcessed ?? 0,
          queriesRun: result.queriesRun ?? 0,
        });
      }
    }
  } catch (error) {
    taskError = error instanceof Error ? error.message : String(error);

    if (signal.aborted) {
      taskStatus = "interrupted";
      taskError = null;
      await writeProjectRuntimeEvent(input.projectId, "task.interrupted", {
        taskId,
        taskType: input.type,
        jobId: input.jobId ?? null,
      });
    } else {
      taskStatus = "failed";
      logError("task failed", {
        taskId,
        projectId: input.projectId,
        type: input.type,
        error,
      });
      await writeProjectRuntimeEvent(input.projectId, "task.failed", {
        taskId,
        taskType: input.type,
        jobId: input.jobId ?? null,
        error: taskError,
      });
    }
  } finally {
    activeTasks.delete(taskId);
  }

  await db
    .update(tasks)
    .set({ status: taskStatus, updatedAt: now(), error: taskError })
    .where(eq(tasks.id, taskId));
}
