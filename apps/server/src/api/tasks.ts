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
    let taskStatus: TaskRecord["status"] = "running";
    let taskError: string | null = null;

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
      status: "running",
    });

    logInfo("task started", {
      taskId,
      projectId: input.projectId,
      type: input.type,
    });

    try {
      const result = await runTask(input, taskId, timestamp);
      taskStatus = "completed";
      await writeProjectRuntimeEvent(input.projectId, "task.completed", {
        taskId,
        taskType: input.type,
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
        error: taskError,
      });
    }

    await db
      .update(tasks)
      .set({ status: taskStatus, updatedAt: now(), error: taskError })
      .where(eq(tasks.id, taskId));

    return c.json(
      {
        id: taskId,
        projectId: input.projectId,
        type: input.type,
        status: taskStatus,
        error: taskError,
        createdAt: timestamp,
        updatedAt: now(),
      },
      201,
    );
  });
}
