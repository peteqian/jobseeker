import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type {
  ClaimThread,
  StartCoachReviewInput,
  UpdateCoachNextStepInput,
} from "@jobseeker/contracts";

import { db } from "../db";
import { chatThreads, claimThreads, coachClaims, coachReviews } from "../db/schema";
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
    });
    return c.json(task, 202);
  });

  app.patch("/api/coach-next-steps/:stepId", async (c) => {
    const body = (await c.req.json()) as UpdateCoachNextStepInput;
    const step = await setCoachNextStepCompleted(c.req.param("stepId"), body.completed);
    if (!step) return c.json({ error: "not found" }, 404);
    return c.json(step);
  });

  app.post("/api/coach-claims/:claimId/threads", async (c) => {
    const claimId = c.req.param("claimId");
    const claim = await db.select().from(coachClaims).where(eq(coachClaims.id, claimId)).get();
    if (!claim) return c.json({ error: "claim not found" }, 404);

    const review = await db
      .select()
      .from(coachReviews)
      .where(eq(coachReviews.id, claim.reviewId))
      .get();
    if (!review) return c.json({ error: "review not found" }, 404);

    const existing = await db
      .select()
      .from(claimThreads)
      .where(eq(claimThreads.claimId, claimId))
      .orderBy(desc(claimThreads.createdAt))
      .limit(1)
      .get();
    if (existing) {
      return c.json(toClaimThread(existing));
    }

    const timestamp = now();
    const threadId = makeId("thread");
    await db.insert(chatThreads).values({
      id: threadId,
      projectId: review.projectId,
      scope: "coach",
      title: claim.text.slice(0, 80),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const mappingId = makeId("cthread");
    await db.insert(claimThreads).values({
      id: mappingId,
      claimId,
      threadId,
      createdAt: timestamp,
    });

    return c.json<ClaimThread>({ id: mappingId, claimId, threadId, createdAt: timestamp }, 201);
  });

  app.get("/api/coach-claims/:claimId/threads", async (c) => {
    const rows = await db
      .select()
      .from(claimThreads)
      .where(eq(claimThreads.claimId, c.req.param("claimId")))
      .all();
    return c.json(rows.map(toClaimThread));
  });
}

function toClaimThread(row: {
  id: string;
  claimId: string;
  threadId: string;
  createdAt: string;
}): ClaimThread {
  return { id: row.id, claimId: row.claimId, threadId: row.threadId, createdAt: row.createdAt };
}
