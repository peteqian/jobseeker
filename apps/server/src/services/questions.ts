import { mkdirSync } from "node:fs";
import type {
  QuestionCard,
  QuestionCardSectionKey,
  QuestionCardSections,
  QuestionCardSource,
  QuestionCardStatus,
} from "@jobseeker/contracts";

import { projectPath } from "../lib/paths";

const questionCardSectionHeadings: Record<QuestionCardSectionKey, string> = {
  currentAnswer: "Current answer",
  evidenceSoFar: "Evidence so far",
  whyItMatters: "Why it matters",
  pushback: "Pushback",
  followUpQuestions: "Follow-up questions",
  resumeAngles: "Resume angles",
  conversation: "Conversation",
};

const headingToSectionKey = new Map(
  Object.entries(questionCardSectionHeadings).map(([key, heading]) => [heading.toLowerCase(), key]),
) as Map<string, QuestionCardSectionKey>;

export function createEmptyQuestionCardSections(): QuestionCardSections {
  return {
    currentAnswer: "",
    evidenceSoFar: [],
    whyItMatters: [],
    pushback: [],
    followUpQuestions: [],
    resumeAngles: [],
    conversation: [],
  };
}

export function questionCardsDir(projectSlug: string) {
  return projectPath(projectSlug, "question-cards");
}

export function questionCardPath(projectSlug: string, slug: string) {
  return projectPath(projectSlug, "question-cards", `${slug}.md`);
}

export async function writeQuestionCardFile(card: QuestionCard) {
  mkdirSync(questionCardsDir(card.projectId), { recursive: true });
  await Bun.write(card.path, serializeQuestionCard(card));
}

export async function readQuestionCardFile(
  fallback: Omit<QuestionCard, "sections"> & { sections?: QuestionCardSections },
) {
  const sections = fallback.sections ?? createEmptyQuestionCardSections();
  const file = Bun.file(fallback.path);

  if (!(await file.exists())) {
    return { ...fallback, sections };
  }

  const content = await file.text();
  return parseQuestionCardMarkdown(content, { ...fallback, sections });
}

export function parseQuestionCardMarkdown(markdown: string, fallback: QuestionCard): QuestionCard {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  const metadata = new Map<string, string>();

  if (lines[0] === "---") {
    index = 1;
    while (index < lines.length && lines[index] !== "---") {
      const line = lines[index] ?? "";
      const delimiter = line.indexOf(":");
      if (delimiter > -1) {
        const key = line.slice(0, delimiter).trim();
        const value = line.slice(delimiter + 1).trim();
        metadata.set(key, value);
      }
      index += 1;
    }

    if (lines[index] === "---") {
      index += 1;
    }
  }

  const sections = createEmptyQuestionCardSections();
  let activeSection: QuestionCardSectionKey | null = null;
  let currentAnswerLines: string[] = [];

  function flushCurrentAnswer() {
    if (activeSection !== "currentAnswer") {
      currentAnswerLines = [];
      return;
    }

    const value = currentAnswerLines.join("\n").trim();
    sections.currentAnswer = value === "_No answer yet._" ? "" : value;
    currentAnswerLines = [];
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headingMatch = line.match(/^##\s+(.+)$/);

    if (headingMatch) {
      flushCurrentAnswer();
      activeSection = headingToSectionKey.get(headingMatch[1].trim().toLowerCase()) ?? null;
      continue;
    }

    if (!activeSection) {
      continue;
    }

    if (activeSection === "currentAnswer") {
      currentAnswerLines.push(line);
      continue;
    }

    if (!line.startsWith("- ")) {
      continue;
    }

    const value = line.replace(/^-\s+/, "").trim();
    if (value && value !== "None yet.") {
      sections[activeSection].push(value);
    }
  }

  flushCurrentAnswer();

  return {
    ...fallback,
    projectId: metadata.get("projectId") ?? fallback.projectId,
    taskId: metadata.get("taskId")?.trim() ? (metadata.get("taskId") ?? null) : fallback.taskId,
    slug: metadata.get("slug") ?? fallback.slug,
    title: metadata.get("title") ?? fallback.title,
    prompt: metadata.get("prompt") ?? fallback.prompt,
    status: (metadata.get("status") as QuestionCardStatus | undefined) ?? fallback.status,
    source: (metadata.get("source") as QuestionCardSource | undefined) ?? fallback.source,
    createdAt: metadata.get("createdAt") ?? fallback.createdAt,
    updatedAt: metadata.get("updatedAt") ?? fallback.updatedAt,
    sections,
  };
}

export function serializeQuestionCard(card: QuestionCard) {
  const sections = [
    renderTextSection("Current answer", card.sections.currentAnswer),
    renderListSection("Evidence so far", card.sections.evidenceSoFar),
    renderListSection("Why it matters", card.sections.whyItMatters),
    renderListSection("Pushback", card.sections.pushback),
    renderListSection("Follow-up questions", card.sections.followUpQuestions),
    renderListSection("Resume angles", card.sections.resumeAngles),
    renderListSection("Conversation", card.sections.conversation),
  ].join("\n\n");

  return [
    "---",
    `id: ${card.id}`,
    `projectId: ${card.projectId}`,
    `taskId: ${card.taskId ?? ""}`,
    `slug: ${card.slug}`,
    `title: ${card.title}`,
    `prompt: ${singleLine(card.prompt)}`,
    `status: ${card.status}`,
    `source: ${card.source}`,
    `createdAt: ${card.createdAt}`,
    `updatedAt: ${card.updatedAt}`,
    "---",
    "",
    sections,
    "",
  ].join("\n");
}

function renderTextSection(title: string, value: string) {
  return [`## ${title}`, "", value.trim() || "_No answer yet._"].join("\n");
}

function renderListSection(title: string, items: string[]) {
  return [
    `## ${title}`,
    "",
    ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- None yet."]),
  ].join("\n");
}

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
