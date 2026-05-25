import { eq, ne } from "drizzle-orm";
import type { StructuredProfile } from "@jobseeker/contracts";

import { db } from "../../db";
import { applicationAnswers } from "../../db/schema";
import { deriveAnswersFromProfile } from "./seeding";
import type { AnswerSource } from "./types";

export interface ApplicationAnswer {
  questionKey: string;
  answer: string;
  source: AnswerSource;
  updatedAt: string;
}

/** Reads every stored application answer for a project. */
export async function readAnswers(projectId: string): Promise<ApplicationAnswer[]> {
  const rows = await db
    .select()
    .from(applicationAnswers)
    .where(eq(applicationAnswers.projectId, projectId))
    .all();
  return rows.map((row) => ({
    questionKey: row.questionKey,
    answer: row.answer,
    source: row.source as AnswerSource,
    updatedAt: row.updatedAt,
  }));
}

/** Convenience view for the planner: semantic question key -> answer text. */
export async function answersMap(projectId: string): Promise<Map<string, string>> {
  const rows = await readAnswers(projectId);
  return new Map(rows.map((row) => [row.questionKey, row.answer]));
}

/**
 * Inserts or updates one answer. A manual `user_edit` is never overwritten by a
 * later automated write (profile reseed or agent draft) — only another
 * `user_edit` can replace it.
 */
export async function upsertAnswer(input: {
  projectId: string;
  questionKey: string;
  answer: string;
  source: AnswerSource;
}): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insert(applicationAnswers)
    .values({
      projectId: input.projectId,
      questionKey: input.questionKey,
      answer: input.answer,
      source: input.source,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [applicationAnswers.projectId, applicationAnswers.questionKey],
      set: { answer: input.answer, source: input.source, updatedAt },
      where: input.source === "user_edit" ? undefined : ne(applicationAnswers.source, "user_edit"),
    });
}

/** Seeds the store from a profile, preserving any manual `user_edit` answers. */
export async function seedAnswersFromProfile(
  projectId: string,
  profile: StructuredProfile,
): Promise<void> {
  for (const { key, answer, source } of deriveAnswersFromProfile(profile)) {
    await upsertAnswer({ projectId, questionKey: key, answer, source });
  }
}

/** Deletes a project's stored answers. Exposed for project teardown. */
export async function clearAnswers(projectId: string): Promise<void> {
  await db.delete(applicationAnswers).where(eq(applicationAnswers.projectId, projectId));
}
