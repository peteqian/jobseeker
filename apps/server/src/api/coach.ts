import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type {
  CoachAnchorType,
  CoachGap,
  CoachThreadAnchor,
  StartCoachReviewInput,
  UpdateCoachNextStepInput,
} from "@jobseeker/contracts";

import { db } from "../db";
import {
  chatThreads,
  coachClaims,
  coachGaps,
  coachReviews,
  coachThreadAnchors,
} from "../db/schema";
import { makeId } from "../lib/ids";
import { getLatestCoachReview, setCoachNextStepCompleted } from "../services/coach/review";
import { startTask } from "../services/tasks/startTask";

const now = () => new Date().toISOString();

export function registerCoachRoutes(app: Hono) {
  app.get("/api/projects/:projectId/coach-review", async (c) => {
    const review = await getLatestCoachReview(c.req.param("projectId"));
    if (!review) return c.json(null);
    return c.json(review);
  });

  app.post("/api/projects/:projectId/coach-review", async (c) => {
    const projectId = c.req.param("projectId");
    const body = (await c.req.json()) as Omit<StartCoachReviewInput, "projectId">;
    const task = await startTask({
      projectId,
      type: "coach_review",
      resumeDocId: body.resumeDocId,
      focusArea: body.focusArea,
      deepReview: body.deep,
      pastedJds: body.pastedJds,
      useExplorer: body.useExplorer,
    });
    return c.json(task, 202);
  });

  app.patch("/api/coach-next-steps/:stepId", async (c) => {
    const body = (await c.req.json()) as UpdateCoachNextStepInput;
    const step = await setCoachNextStepCompleted(c.req.param("stepId"), body.completed);
    if (!step) return c.json({ error: "not found" }, 404);
    return c.json(step);
  });

  app.post("/api/coach-anchors/:anchorType/:anchorId/threads", async (c) => {
    const anchorType = c.req.param("anchorType") as CoachAnchorType;
    const anchorId = c.req.param("anchorId");

    const resolved = await resolveAnchorProject(anchorType, anchorId);
    if (!resolved) return c.json({ error: "anchor not found" }, 404);

    const existing = await db
      .select()
      .from(coachThreadAnchors)
      .where(
        and(
          eq(coachThreadAnchors.anchorType, anchorType),
          eq(coachThreadAnchors.anchorId, anchorId),
        ),
      )
      .orderBy(desc(coachThreadAnchors.createdAt))
      .limit(1)
      .get();
    if (existing) return c.json(toAnchor(existing));

    const timestamp = now();
    const threadId = makeId("thread");
    await db.insert(chatThreads).values({
      id: threadId,
      projectId: resolved.projectId,
      scope: "coach",
      title: resolved.title.slice(0, 80),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const mappingId = makeId("cthread");
    await db.insert(coachThreadAnchors).values({
      id: mappingId,
      anchorType,
      anchorId,
      threadId,
      createdAt: timestamp,
    });

    return c.json<CoachThreadAnchor>(
      { id: mappingId, anchorType, anchorId, threadId, createdAt: timestamp },
      201,
    );
  });

  app.get("/api/coach-anchors/:anchorType/:anchorId/threads", async (c) => {
    const anchorType = c.req.param("anchorType") as CoachAnchorType;
    const anchorId = c.req.param("anchorId");
    const rows = await db
      .select()
      .from(coachThreadAnchors)
      .where(
        and(
          eq(coachThreadAnchors.anchorType, anchorType),
          eq(coachThreadAnchors.anchorId, anchorId),
        ),
      )
      .all();
    return c.json(rows.map(toAnchor));
  });
}

async function resolveAnchorProject(
  anchorType: CoachAnchorType,
  anchorId: string,
): Promise<{ projectId: string; title: string } | null> {
  if (anchorType === "claim") {
    const claim = await db.select().from(coachClaims).where(eq(coachClaims.id, anchorId)).get();
    if (!claim) return null;
    const review = await db
      .select()
      .from(coachReviews)
      .where(eq(coachReviews.id, claim.reviewId))
      .get();
    if (!review) return null;
    return { projectId: review.projectId, title: claim.text };
  }
  if (anchorType === "gap") {
    const gap = (await db.select().from(coachGaps).where(eq(coachGaps.id, anchorId)).get()) as
      | CoachGap
      | undefined;
    if (!gap) return null;
    const review = await db
      .select()
      .from(coachReviews)
      .where(eq(coachReviews.id, gap.reviewId))
      .get();
    if (!review) return null;
    return { projectId: review.projectId, title: gap.topic };
  }
  return null;
}

function toAnchor(row: {
  id: string;
  anchorType: string;
  anchorId: string;
  threadId: string;
  createdAt: string;
}): CoachThreadAnchor {
  return {
    id: row.id,
    anchorType: row.anchorType as CoachAnchorType,
    anchorId: row.anchorId,
    threadId: row.threadId,
    createdAt: row.createdAt,
  };
}
