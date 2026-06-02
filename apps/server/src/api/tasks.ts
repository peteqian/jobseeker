import { Hono } from "hono";
import type { StartTaskInput } from "@jobseeker/contracts";

import { interruptTask, startTask } from "../services/tasks/startTask";
import { resolveLogin } from "../services/explorer/loginGate";

export function registerTaskRoutes(app: Hono) {
  app.post("/api/tasks", async (c) => {
    const input = (await c.req.json()) as StartTaskInput;
    const record = await startTask(input);
    return c.json(record, 202);
  });

  app.post("/api/tasks/:taskId/interrupt", async (c) => {
    const taskId = c.req.param("taskId");
    const interrupted = await interruptTask(taskId);
    return c.json({ taskId, interrupted }, interrupted ? 202 : 404);
  });

  // Resumes a run paused on a sign-in wall, once the user has signed in.
  app.post("/api/tasks/:taskId/continue-login", async (c) => {
    const taskId = c.req.param("taskId");
    const resumed = resolveLogin(taskId);
    return c.json({ taskId, resumed }, resumed ? 202 : 404);
  });
}
