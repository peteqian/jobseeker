import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "../db";
import { events } from "../db/schema";
import { subscribeProjectEvents } from "../services/runtimeEvents";

export function registerEventRoutes(app: Hono) {
  app.get("/api/projects/:projectId/events", async (c) => {
    const projectId = c.req.param("projectId");
    const eventsList = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.createdAt))
      .all();

    return c.json({
      events: eventsList.map((event) => ({
        id: event.id,
        projectId: event.projectId,
        type: event.type,
        createdAt: event.createdAt,
        payload: JSON.parse(event.payloadJson),
      })),
    });
  });

  app.get("/api/events", async (c) => {
    const eventsList = await db.select().from(events).orderBy(desc(events.createdAt)).all();

    return c.json({
      events: eventsList.map((event) => ({
        id: event.id,
        projectId: event.projectId,
        type: event.type,
        createdAt: event.createdAt,
        payload: JSON.parse(event.payloadJson),
      })),
    });
  });

  app.get("/api/projects/:projectId/events/stream", async (c) => {
    const projectId = c.req.param("projectId");

    return streamSSE(c, async (stream) => {
      const queue: Array<{ id: string; type: string; data: string }> = [];
      const state = { aborted: false };
      let notify: (() => void) | null = null;

      const unsubscribe = subscribeProjectEvents(projectId, (event) => {
        queue.push({
          id: event.id,
          type: event.type,
          data: JSON.stringify(event),
        });
        notify?.();
      });

      c.req.raw.signal.addEventListener(
        "abort",
        () => {
          state.aborted = true;
          notify?.();
        },
        { once: true },
      );

      const keepaliveMs = 30_000;

      try {
        while (!state.aborted) {
          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            await stream.writeSSE(next);
          }
          if (state.aborted) break;
          const timedOut = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(true), keepaliveMs);
            notify = () => {
              notify = null;
              clearTimeout(timer);
              resolve(false);
            };
          });
          if (timedOut && !state.aborted && queue.length === 0) {
            await stream.writeSSE({ event: "ping", data: "" });
          }
        }
      } finally {
        unsubscribe();
      }
    });
  });
}
