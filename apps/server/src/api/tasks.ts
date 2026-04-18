import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import type {
  ChatModelSelection,
  QuestionCard,
  StartTaskInput,
  StructuredProfile,
  TaskRecord,
} from "@jobseeker/contracts";

import { makeId } from "../lib/ids";
import { createProjectSlug } from "../lib/paths";
import { buildProfileFromResume } from "../services/profile";
import { buildQuestionCardTemplates } from "../prompts/questions";
import { questionCardPath, writeQuestionCardFile } from "../services/questions";
import { db } from "../db";
import { documents, profiles, projects, questionAnswers, questionCards, tasks } from "../db/schema";

const now = () => new Date().toISOString();

async function getResumeTextForProject(projectId: string) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return null;
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt))
    .all();

  const activeResume = docs.find(
    (document) => document.kind === "resume_source" && document.id === project.activeResumeSourceId,
  );
  const extractedResume = docs.find((document) => document.kind === "extracted_text");

  return (extractedResume?.content ?? activeResume?.content ?? "").trim() || null;
}

async function buildAndSaveProfile(projectId: string, modelSelection?: ChatModelSelection) {
  const resumeText = await getResumeTextForProject(projectId);
  if (!resumeText) {
    return;
  }

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return;
  }
  const projectSlug = project.slug ?? createProjectSlug(project.title, project.id);

  const existingRow = await db
    .select()
    .from(profiles)
    .where(eq(profiles.projectId, projectId))
    .get();

  const existingProfile = existingRow
    ? (JSON.parse(existingRow.profileJson) as StructuredProfile)
    : null;

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

  await db
    .insert(profiles)
    .values({
      projectId,
      profileJson: JSON.stringify(profile),
      updatedAt: profile.updatedAt,
    })
    .onConflictDoUpdate({
      target: profiles.projectId,
      set: {
        profileJson: JSON.stringify(profile),
        updatedAt: profile.updatedAt,
      },
    });

  const { ensureProjectDir } = await import("../lib/paths");
  const dir = ensureProjectDir(projectSlug);
  await Bun.write(`${dir}/profile.json`, JSON.stringify(profile, null, 2));
}

async function ensureQuestionCards(projectId: string, taskId: string, timestamp: string) {
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

  const resumeText = await getResumeTextForProject(projectId);
  if (!resumeText) {
    return 0;
  }

  const templates = buildQuestionCardTemplates(resumeText);
  if (templates.length === 0) {
    return 0;
  }

  const cards: QuestionCard[] = templates.map((template) => ({
    id: makeId("qcard"),
    projectId: projectId,
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

export function registerTaskRoutes(app: Hono) {
  app.post("/api/tasks", async (c) => {
    const input = (await c.req.json()) as StartTaskInput;
    const timestamp = now();
    const taskId = makeId("task");
    let taskStatus: TaskRecord["status"] = "running";

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

    if (input.type === "resume_ingest") {
      await buildAndSaveProfile(input.projectId, input.modelSelection);
      await ensureQuestionCards(input.projectId, taskId, timestamp);
      taskStatus = "completed";

      await db
        .update(tasks)
        .set({ status: taskStatus, updatedAt: now() })
        .where(eq(tasks.id, taskId));
    }

    return c.json(
      {
        id: taskId,
        projectId: input.projectId,
        type: input.type,
        status: taskStatus,
        createdAt: timestamp,
        updatedAt: taskStatus === "completed" ? now() : timestamp,
      },
      201,
    );
  });
}
