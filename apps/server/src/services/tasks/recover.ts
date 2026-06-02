import { inArray } from "drizzle-orm";

import { db } from "../../db";
import { tasks } from "../../db/schema";
import { logInfo } from "../../lib/log";
import { writeProjectRuntimeEvent } from "../runtimeEvents";

const now = () => new Date().toISOString();

export async function recoverStaleTasks(): Promise<number> {
  const staleStatuses = ["running", "queued"] as const;

  const staleTasks = await db.select().from(tasks).where(inArray(tasks.status, staleStatuses));

  if (staleTasks.length === 0) {
    return 0;
  }

  const timestamp = now();

  await db
    .update(tasks)
    .set({
      status: "interrupted",
      updatedAt: timestamp,
      error: "Server restarted while task was running",
    })
    .where(inArray(tasks.status, staleStatuses));

  for (const task of staleTasks) {
    await writeProjectRuntimeEvent(task.projectId, "task.interrupted", {
      taskId: task.id,
      taskType: task.type,
      jobId: null,
    });
  }

  logInfo("recovered stale tasks", {
    count: staleTasks.length,
    taskIds: staleTasks.map((t) => t.id),
  });

  return staleTasks.length;
}
