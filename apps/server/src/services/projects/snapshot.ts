import { asc, desc, eq } from "drizzle-orm";
import type {
  ChatMessage,
  InsightCard,
  JobMatch,
  JobRecord,
  PendingQuestion,
  ProjectDocument,
  ProjectSnapshot,
  ProjectStatus,
  QuestionCard,
  QuestionFieldValue,
  TaskRecord,
  TopicFileMeta,
} from "@jobseeker/contracts";

import { db } from "../../db";
import {
  chatMessages,
  chatThreads,
  documents,
  explorerConfigs,
  insightCards,
  jobMatches,
  jobs,
  profiles,
  questionAnswers,
  questionCards,
  questions,
  projects,
  tasks,
  topicFiles,
} from "../../db/schema";
import { createProjectSlug } from "../../lib/paths";
import { createEmptyQuestionCardSections, readQuestionCardFile } from "../questions";
import { defaultExplorerConfig, mapExplorerConfigRow } from "./explorerConfig";

/**
 * Materializes the server's aggregate "project view" read model.
 *
 * Route handlers use this snapshot so clients can re-fetch a consistent view of
 * documents, tasks, chat state, explorer results, and profile-derived data
 * after any project mutation.
 */
export async function buildProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshot | undefined> {
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
    chatThreadRows,
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
    db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.projectId, projectId))
      .orderBy(asc(chatThreads.createdAt))
      .all(),
  ]);

  const coachThread =
    chatThreadRows.find((thread) => thread.scope === "coach" && thread.status === "active") ??
    chatThreadRows.find((thread) => thread.scope === "coach") ??
    null;
  const coachThreadId = coachThread?.id ?? null;

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
      jobId: document.jobId,
      kind: document.kind as ProjectDocument["kind"],
      mimeType: document.mimeType,
      name: document.name,
      path: document.path,
      content: document.content ?? undefined,
      createdAt: document.createdAt,
    })),
    chatThreads: chatThreadRows.map((thread) => ({
      id: thread.id,
      projectId: thread.projectId,
      scope: thread.scope as "coach" | "explorer",
      title: thread.title,
      status: thread.status as "active" | "archived",
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    })),
    chatMessages: chatMessageRows
      .map((msg) => ({
        id: msg.id,
        projectId: msg.projectId,
        threadId: msg.threadId ?? coachThreadId ?? "",
        role: msg.role as ChatMessage["role"],
        content: msg.content,
        createdAt: msg.createdAt,
      }))
      .filter(
        (message) =>
          message.threadId !== "" && (coachThreadId ? message.threadId === coachThreadId : true),
      ),
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
      ? mapExplorerConfigRow(explorerRow)
      : defaultExplorerConfig(projectId, project.updatedAt),
    profile: profile ? JSON.parse(profile.profileJson) : null,
    activeResumeSourceId: project.activeResumeSourceId ?? null,
  };
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
