import { Hono } from "hono";
import type { StartTaskInput } from "@jobseeker/contracts";

import { startTask } from "../services/tasks/startTask";

export function registerTaskRoutes(app: Hono) {
  app.post("/api/tasks", async (c) => {
    const input = (await c.req.json()) as StartTaskInput;
    const record = await startTask(input);
    return c.json(record, 202);
  });
}
