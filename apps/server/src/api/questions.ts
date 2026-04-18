import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type {
  PendingQuestion,
  PendingQuestionField,
  QuestionAnswerInput,
  QuestionCard,
  QuestionFieldValue,
  StructuredProfile,
} from "@jobseeker/contracts";

import { makeId } from "../lib/ids";
import {
  createEmptyQuestionCardSections,
  readQuestionCardFile,
  writeQuestionCardFile,
} from "../services/questions";
import { db } from "../db";
import { profiles, questionAnswers, questionCards, questions } from "../db/schema";
import { readProjectSnapshot, writeProfileFile } from "./projects";

const now = () => new Date().toISOString();

export function registerQuestionRoutes(app: Hono) {
  app.put("/api/projects/:projectId/question-cards/:cardId", async (c) => {
    const { projectId, cardId } = c.req.param();
    const payload = (await c.req.json()) as { answer?: string };
    const row = await db.select().from(questionCards).where(eq(questionCards.id, cardId)).get();

    if (!row || row.projectId !== projectId) {
      return c.json({ error: "Question card not found." }, 404);
    }

    const timestamp = now();
    const card = await readQuestionCardFile({
      id: row.id,
      projectId: row.projectId,
      taskId: row.taskId,
      slug: row.slug,
      title: row.title,
      prompt: row.prompt,
      status: row.status as QuestionCard["status"],
      source: row.source as QuestionCard["source"],
      path: row.path,
      sections: createEmptyQuestionCardSections(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    const nextCard: QuestionCard = {
      ...card,
      status: payload.answer?.trim() ? "answered" : "open",
      updatedAt: timestamp,
      sections: {
        ...card.sections,
        currentAnswer: payload.answer?.trim() ?? "",
      },
    };

    await writeQuestionCardFile(nextCard);

    await db
      .update(questionCards)
      .set({
        status: nextCard.status,
        updatedAt: timestamp,
        title: nextCard.title,
        prompt: nextCard.prompt,
      })
      .where(eq(questionCards.id, cardId));

    const snapshot = await readProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });

  app.post("/api/projects/:projectId/questions/answers", async (c) => {
    const projectId = c.req.param("projectId");
    const payload = (await c.req.json()) as Omit<QuestionAnswerInput, "projectId">;

    const snapshot = await readProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    const answeredAt = now();
    const normalized = normalizeQuestionAnswers(
      projectId,
      snapshot.questions,
      payload.answers ?? {},
      answeredAt,
    );

    if (normalized.missingField) {
      return c.json({ error: `Answer required for "${normalized.missingField.label}".` }, 400);
    }

    if (normalized.records.length > 0) {
      await db.insert(questionAnswers).values(
        normalized.records.map((record) => ({
          id: makeId("qans"),
          projectId: record.projectId,
          questionId: record.questionId,
          questionPrompt: record.questionPrompt,
          fieldId: record.fieldId,
          fieldLabel: record.fieldLabel,
          answerJson: JSON.stringify(record.answer),
          answeredAt: record.answeredAt,
        })),
      );
    }

    if (snapshot.profile) {
      const existingClarifications = snapshot.profile.memory.clarifications.filter(
        (clarification: StructuredProfile["memory"]["clarifications"][number]) =>
          !normalized.records.some((record) => record.fieldId === clarification.questionId),
      );

      const updatedProfile: StructuredProfile = {
        ...snapshot.profile,
        updatedAt: answeredAt,
        memory: {
          ...snapshot.profile.memory,
          clarifications: [
            ...normalized.records.map((record) => ({
              questionId: record.fieldId,
              question: record.questionLabel,
              answer: questionAnswerToText(record.answer),
              answeredAt: record.answeredAt,
            })),
            ...existingClarifications,
          ],
        },
      };

      await db
        .insert(profiles)
        .values({
          projectId,
          profileJson: JSON.stringify(updatedProfile),
          updatedAt: answeredAt,
        })
        .onConflictDoUpdate({
          target: profiles.projectId,
          set: {
            profileJson: JSON.stringify(updatedProfile),
            updatedAt: answeredAt,
          },
        });

      await writeProfileFile(projectId, updatedProfile);
    }

    await db.delete(questions).where(eq(questions.projectId, projectId));

    const nextSnapshot = await readProjectSnapshot(projectId);
    if (!nextSnapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(nextSnapshot);
  });
}

// ---------------------------------------------------------------------------
// Question answer helpers
// ---------------------------------------------------------------------------

function normalizeQuestionAnswers(
  projectId: string,
  pendingQuestions: PendingQuestion[],
  answers: QuestionAnswerInput["answers"],
  answeredAt: string,
) {
  const records: Array<{
    projectId: string;
    questionId: string;
    questionPrompt: string;
    questionLabel: string;
    fieldId: string;
    fieldLabel: string;
    answer: QuestionFieldValue;
    answeredAt: string;
  }> = [];

  for (const question of pendingQuestions) {
    for (const field of question.fields) {
      const answer = normalizeQuestionFieldValue(field, answers[field.id]);
      const required = field.required ?? true;

      if (required && isQuestionAnswerEmpty(answer)) {
        return { records: [], missingField: field };
      }

      if (isQuestionAnswerEmpty(answer)) {
        continue;
      }

      records.push({
        projectId,
        questionId: question.id,
        questionPrompt: question.prompt,
        questionLabel: buildQuestionLabel(question, field),
        fieldId: field.id,
        fieldLabel: field.label,
        answer,
        answeredAt,
      });
    }
  }

  return {
    records,
    missingField: null as PendingQuestionField | null,
  };
}

function normalizeQuestionFieldValue(
  field: PendingQuestionField,
  rawValue: QuestionAnswerInput["answers"][string] | undefined,
): QuestionFieldValue {
  const allowedOptions = new Set(field.options?.map((option) => option.value) ?? []);

  if (field.type === "multiselect") {
    const values = Array.isArray(rawValue)
      ? rawValue
      : typeof rawValue === "string" && rawValue.trim()
        ? [rawValue]
        : [];

    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].filter((value) =>
      allowedOptions.size === 0 ? true : allowedOptions.has(value),
    );
  }

  const value = Array.isArray(rawValue)
    ? rawValue
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(", ")
    : (rawValue ?? "").trim();

  if (field.type === "select" && allowedOptions.size > 0) {
    return allowedOptions.has(value) ? value : "";
  }

  return value;
}

function isQuestionAnswerEmpty(value: QuestionFieldValue) {
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
}

function questionAnswerToText(value: QuestionFieldValue) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function buildQuestionLabel(question: PendingQuestion, field: PendingQuestionField) {
  return question.fields.length === 1 ? question.prompt : `${question.prompt} - ${field.label}`;
}
