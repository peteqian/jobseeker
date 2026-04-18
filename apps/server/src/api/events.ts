import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "../db";
import { events } from "../db/schema";

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

    const existingEvents = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.createdAt))
      .all();

    return streamSSE(c, async (stream) => {
      for (const event of existingEvents) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify({
            id: event.id,
            projectId: event.projectId,
            type: event.type,
            createdAt: event.createdAt,
            payload: JSON.parse(event.payloadJson),
          }),
          id: event.id,
        });
      }

      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
  });
}
