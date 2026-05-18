import { asc, eq } from "drizzle-orm";
import type { ChatModelSelection, QuestionCard } from "@jobseeker/contracts";

import { db } from "../../db";
import { projects, questionAnswers, questionCards } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { createProjectSlug } from "../../lib/paths";
import { buildQuestionCardTemplates } from "../../prompts/questions";
import { buildProfileFromResume } from "../profile";
import { questionCardPath, writeQuestionCardFile } from "../questions";
import { readProjectProfile, upsertProjectProfile, writeProfileFile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";

/**
 * Rebuilds the project's structured profile from the latest resume text and any
 * recorded clarification answers, then persists both the DB row and the checked
 * in `profile.json` mirror used by local tooling.
 */
export async function buildAndSaveProfile(
  projectId: string,
  modelSelection?: ChatModelSelection,
): Promise<void> {
  const resumeText = await getProjectResumeText(projectId);
  if (!resumeText) {
    return;
  }

  const existingProfile = await readProjectProfile(projectId);
  const history = await db
    .select()
    .from(questionAnswers)
    .where(eq(questionAnswers.projectId, projectId))
    .all();

  const profile = await buildProfileFromResume(
    resumeText,
    history,
    existingProfile,
    modelSelection,
  );

  await upsertProjectProfile(projectId, profile);
  await writeProfileFile(projectId, profile);
}

/**
 * Seeds generated question cards for resume ingest only when the project does
 * not already have them.
 *
 * The function is intentionally idempotent so rerunning resume ingest does not
 * overwrite user-edited card files.
 */
export async function createQuestionCardsIfMissing(
  projectId: string,
  taskId: string,
  timestamp: string,
): Promise<number> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return 0;
  }

  const existing = await db
    .select()
    .from(questionCards)
    .where(eq(questionCards.projectId, projectId))
    .orderBy(asc(questionCards.createdAt))
    .all();

  if (existing.length > 0) {
    return existing.length;
  }

  const resumeText = await getProjectResumeText(projectId);
  if (!resumeText) {
    return 0;
  }

  const templates = buildQuestionCardTemplates(resumeText);
  if (templates.length === 0) {
    return 0;
  }

  const cards: QuestionCard[] = templates.map((template) => ({
    id: makeId("qcard"),
    projectId,
    taskId,
    slug: template.slug,
    title: template.title,
    prompt: template.prompt,
    status: template.sections.currentAnswer.trim() ? "answered" : "open",
    source: template.source,
    path: questionCardPath(
      project.slug ?? createProjectSlug(project.title, project.id),
      template.slug,
    ),
    sections: template.sections,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await Promise.all(cards.map((card) => writeQuestionCardFile(card)));

  await db.insert(questionCards).values(
    cards.map((card) => ({
      id: card.id,
      projectId: card.projectId,
      taskId: card.taskId,
      slug: card.slug,
      title: card.title,
      prompt: card.prompt,
      status: card.status,
      source: card.source,
      path: card.path,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    })),
  );

  return cards.length;
}
