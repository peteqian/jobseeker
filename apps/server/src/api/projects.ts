import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import type {
  ChatMessage,
  ExplorerConfigRecord,
  InsightCard,
  JobMatch,
  JobRecord,
  PendingQuestion,
  ProjectDocument,
  ProjectSnapshot,
  ProjectStatus,
  QuestionCard,
  QuestionFieldValue,
  StructuredProfile,
  TaskRecord,
  TopicFileMeta,
} from "@jobseeker/contracts";

import { makeId } from "../lib/ids";
import { createProjectSlug, ensureProjectDir } from "../lib/paths";
import { createEmptyQuestionCardSections, readQuestionCardFile } from "../services/questions";
import { db } from "../db";
import {
  chatMessages,
  documents,
  explorerConfigs,
  insightCards,
  jobMatches,
  jobs,
  profiles,
  questionAnswers,
  questionCards,
  questions,
  tasks,
  projects,
  topicFiles,
} from "../db/schema";

const now = () => new Date().toISOString();

async function ensureProjectSlugs() {
  const rows = await db.select().from(projects).orderBy(asc(projects.createdAt)).all();
  const used = new Set<string>();

  for (const row of rows) {
    const nextSlug = row.slug?.trim() || createProjectSlug(row.title, row.id);
    if (used.has(nextSlug)) {
      continue;
    }
    used.add(nextSlug);
    if (row.slug === nextSlug) {
      continue;
    }
    await db.update(projects).set({ slug: nextSlug }).where(eq(projects.id, row.id));
  }
}

export function registerProjectRoutes(app: Hono) {
  app.get("/api/projects", async (c) => {
    await ensureProjectSlugs();
    const projectRows = await db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
    const snapshots = await Promise.all(
      projectRows.map((project) => readProjectSnapshot(project.id)),
    );

    return c.json({ projects: snapshots.filter(isDefined) });
  });

  app.post("/api/projects", async (c) => {
    const input = (await c.req.json()) as { title: string };
    const timestamp = now();
    const projectId = makeId("project");
    const projectSlug = createProjectSlug(input.title, projectId);

    await db.insert(projects).values({
      id: projectId,
      slug: projectSlug,
      title: input.title,
      status: "idle",
      activeResumeSourceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    ensureProjectDir(projectSlug);

    await db.insert(explorerConfigs).values({
      projectId,
      domainsJson: JSON.stringify([]),
      includeAgentSuggestions: true,
      updatedAt: timestamp,
    });

    const snapshot = await readProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot, 201);
  });

  app.get("/api/projects/:projectId", async (c) => {
    await ensureProjectSlugs();
    const projectId = c.req.param("projectId");

    const snapshot = await readProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });

  app.get("/api/projects/:projectId/documents/:documentId", async (c) => {
    const { projectId, documentId } = c.req.param();

    const document = await db.select().from(documents).where(eq(documents.id, documentId)).get();

    if (!document || document.projectId !== projectId) {
      return c.json({ error: "Document not found." }, 404);
    }

    const content =
      document.content ??
      (await Bun.file(document.path)
        .text()
        .catch(() => null));

    return c.json({ document: { ...document, content } });
  });

  app.get("/api/projects/:projectId/profile", async (c) => {
    const projectId = c.req.param("projectId");
    const profile = await db.select().from(profiles).where(eq(profiles.projectId, projectId)).get();

    return c.json({ profile: profile ? JSON.parse(profile.profileJson) : null });
  });

  app.put("/api/projects/:projectId/profile", async (c) => {
    const projectId = c.req.param("projectId");
    const profileData = (await c.req.json()) as StructuredProfile;
    const timestamp = now();

    await db
      .insert(profiles)
      .values({
        projectId,
        profileJson: JSON.stringify(profileData),
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: profiles.projectId,
        set: {
          profileJson: JSON.stringify(profileData),
          updatedAt: timestamp,
        },
      })
      .run();

    await writeProfileFile(projectId, profileData);

    const snapshot = await readProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });
}

// ---------------------------------------------------------------------------
// Shared helpers (used by other route files)
// ---------------------------------------------------------------------------

export async function writeProfileFile(projectId: string, profile: StructuredProfile) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return;
  }

  const slug = project.slug ?? createProjectSlug(project.title, project.id);
  const dir = ensureProjectDir(slug);
  await Bun.write(`${dir}/profile.json`, JSON.stringify(profile, null, 2));
}

export async function readProjectSnapshot(projectId: string): Promise<ProjectSnapshot | undefined> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    return undefined;
  }

  const [
    tasksList,
    docs,
    explorerRow,
    chatMessageRows,
    insightCardRows,
    questionCardRows,
    questionsList,
    questionHistoryList,
    jobsList,
    matches,
    profile,
    topicFileRows,
  ] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.createdAt))
      .all(),
    db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(asc(documents.createdAt))
      .all(),
    db.select().from(explorerConfigs).where(eq(explorerConfigs.projectId, projectId)).get(),
    db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.projectId, projectId))
      .orderBy(asc(chatMessages.createdAt))
      .all(),
    db
      .select()
      .from(insightCards)
      .where(eq(insightCards.projectId, projectId))
      .orderBy(desc(insightCards.createdAt))
      .all(),
    db
      .select()
      .from(questionCards)
      .where(eq(questionCards.projectId, projectId))
      .orderBy(asc(questionCards.createdAt))
      .all(),
    db
      .select()
      .from(questions)
      .where(eq(questions.projectId, projectId))
      .orderBy(asc(questions.createdAt))
      .all(),
    db
      .select()
      .from(questionAnswers)
      .where(eq(questionAnswers.projectId, projectId))
      .orderBy(desc(questionAnswers.answeredAt))
      .all(),
    db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(asc(jobs.createdAt)).all(),
    db.select().from(jobMatches).where(eq(jobMatches.projectId, projectId)).all(),
    db.select().from(profiles).where(eq(profiles.projectId, projectId)).get(),
    db
      .select()
      .from(topicFiles)
      .where(eq(topicFiles.projectId, projectId))
      .orderBy(asc(topicFiles.createdAt))
      .all(),
  ]);

  return {
    project: {
      id: project.id,
      slug: project.slug ?? createProjectSlug(project.title, project.id),
      title: project.title,
      status: project.status as ProjectStatus,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    tasks: tasksList.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      type: task.type as TaskRecord["type"],
      status: task.status as TaskRecord["status"],
      providerTurnId: task.providerTurnId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      error: task.error,
    })),
    documents: docs.map((document) => ({
      id: document.id,
      projectId: document.projectId,
      kind: document.kind as ProjectDocument["kind"],
      mimeType: document.mimeType,
      name: document.name,
      path: document.path,
      content: document.content ?? undefined,
      createdAt: document.createdAt,
    })),
    chatMessages: chatMessageRows.map((msg) => ({
      id: msg.id,
      projectId: msg.projectId,
      role: msg.role as ChatMessage["role"],
      content: msg.content,
      createdAt: msg.createdAt,
    })),
    insightCards: insightCardRows
      .filter((card) => card.status === "active")
      .map((card) => ({
        id: card.id,
        projectId: card.projectId,
        chatMessageId: card.chatMessageId,
        title: card.title,
        body: card.body,
        category: card.category as InsightCard["category"],
        status: card.status as InsightCard["status"],
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      })),
    questionCards: await Promise.all(
      questionCardRows.map((card) =>
        readQuestionCardFile({
          id: card.id,
          projectId: card.projectId,
          taskId: card.taskId,
          slug: card.slug,
          title: card.title,
          prompt: card.prompt,
          status: card.status as QuestionCard["status"],
          source: card.source as QuestionCard["source"],
          path: card.path,
          sections: createEmptyQuestionCardSections(),
          createdAt: card.createdAt,
          updatedAt: card.updatedAt,
        }),
      ),
    ),
    questions: questionsList.map((question) => ({
      id: question.id,
      projectId: question.projectId,
      taskId: question.taskId,
      prompt: question.prompt,
      fields: JSON.parse(question.fieldsJson) as PendingQuestion["fields"],
      createdAt: question.createdAt,
    })),
    questionHistory: questionHistoryList.map((answer) => ({
      id: answer.id,
      projectId: answer.projectId,
      questionId: answer.questionId,
      questionPrompt: answer.questionPrompt,
      fieldId: answer.fieldId,
      fieldLabel: answer.fieldLabel,
      answer: JSON.parse(answer.answerJson) as QuestionFieldValue,
      answeredAt: answer.answeredAt,
    })),
    jobs: jobsList.map((job) => ({
      id: job.id,
      projectId: job.projectId,
      source: job.source as JobRecord["source"],
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      summary: job.summary,
      salary: job.salary ?? undefined,
      createdAt: job.createdAt,
    })),
    jobMatches: matches.map((match) => ({
      jobId: match.jobId,
      projectId: match.projectId,
      score: match.score,
      reasons: JSON.parse(match.reasonsJson) as string[],
      gaps: JSON.parse(match.gapsJson) as string[],
    })) as JobMatch[],
    topicFiles: topicFileRows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      slug: row.slug,
      title: row.title,
      status: row.status as TopicFileMeta["status"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    explorer: explorerRow
      ? mapExplorer(explorerRow)
      : defaultExplorer(projectId, project.updatedAt),
    profile: profile ? (JSON.parse(profile.profileJson) as StructuredProfile) : null,
    activeResumeSourceId: project.activeResumeSourceId ?? null,
  };
}

function mapExplorer(row: typeof explorerConfigs.$inferSelect): ExplorerConfigRecord {
  return {
    projectId: row.projectId,
    domains: normalizeDomainConfigs(JSON.parse(row.domainsJson)),
    includeAgentSuggestions: row.includeAgentSuggestions,
    updatedAt: row.updatedAt,
  };
}

function normalizeDomainConfigs(input: unknown): ExplorerConfigRecord["domains"] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          domain: entry,
          enabled: true,
          jobLimit: 25,
          freshness: "week" as const,
          queries: [],
        };
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const domain = typeof record.domain === "string" ? record.domain : null;
        if (!domain) return null;

        const queriesSource = Array.isArray(record.queries)
          ? record.queries
          : Array.isArray(record.queryIds)
            ? record.queryIds
            : [];

        return {
          domain,
          enabled: record.enabled !== false,
          jobLimit: typeof record.jobLimit === "number" ? record.jobLimit : 25,
          freshness:
            record.freshness === "24h" ||
            record.freshness === "week" ||
            record.freshness === "month" ||
            record.freshness === "any"
              ? record.freshness
              : "week",
          queries: queriesSource.filter((value): value is string => typeof value === "string"),
        };
      }

      return null;
    })
    .filter((entry): entry is ExplorerConfigRecord["domains"][number] => entry !== null);
}

function defaultExplorer(projectId: string, updatedAt: string): ExplorerConfigRecord {
  return {
    projectId,
    domains: [],
    includeAgentSuggestions: true,
    updatedAt,
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
