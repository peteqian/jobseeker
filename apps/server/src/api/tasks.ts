import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { StartTaskInput, TaskRecord } from "@jobseeker/contracts";

import { makeId } from "../lib/ids";
import { logError, logInfo } from "../lib/log";
import { writeProjectRuntimeEvent } from "../services/runtimeEvents";
import { runTask } from "../services/tasks/runTask";
import { db } from "../db";
import { tasks } from "../db/schema";

const now = () => new Date().toISOString();

export function registerTaskRoutes(app: Hono) {
  app.post("/api/tasks", async (c) => {
    const input = (await c.req.json()) as StartTaskInput;
    const timestamp = now();
    const taskId = makeId("task");
    const taskStatus: TaskRecord["status"] = "running";

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

    void executeTask(input, taskId, timestamp);

    return c.json(
      {
        id: taskId,
        projectId: input.projectId,
        type: input.type,
        status: taskStatus,
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      202,
    );
  });
}

async function executeTask(
  input: StartTaskInput,
  taskId: string,
  timestamp: string,
): Promise<void> {
  let taskStatus: TaskRecord["status"] = "running";
  let taskError: string | null = null;

  try {
    const result = await runTask(input, taskId, timestamp);
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
  } catch (error) {
    taskStatus = "failed";
    taskError = error instanceof Error ? error.message : String(error);

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

  await db
    .update(tasks)
    .set({ status: taskStatus, updatedAt: now(), error: taskError })
    .where(eq(tasks.id, taskId));
}
