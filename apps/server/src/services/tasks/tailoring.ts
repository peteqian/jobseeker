import { eq } from "drizzle-orm";
import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";

import { db } from "../../db";
import { documents, jobs } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { runOneShotPrompt, stripFences } from "../llm/oneShotPrompt";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { writeProjectRuntimeEvent } from "../runtimeEvents";

const TAILORING_TIMEOUT_MS = 3 * 60 * 1000;

type TailoringKind = "resume_tailoring" | "cover_letter_tailoring";

interface TailoringInput {
  projectId: string;
  taskId: string;
  jobId?: string;
  kind: TailoringKind;
  modelSelection?: ChatModelSelection;
}

export async function runTailoringTask(input: TailoringInput): Promise<void> {
  const { projectId, taskId, jobId, kind, modelSelection } = input;

  if (!jobId) {
    throw new Error("jobId is required for tailoring tasks");
  }

  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  await writeProjectRuntimeEvent(projectId, "task.progress", {
    taskId,
    taskType: kind,
    jobId,
    phase: "loading_context",
  });

  const resumeText = (await getProjectResumeText(projectId)) ?? "";
  const profile = await readProjectProfile(projectId);

  const documentKind = kind === "resume_tailoring" ? "tailored_resume" : "cover_letter";

  await writeProjectRuntimeEvent(projectId, "task.progress", {
    taskId,
    taskType: kind,
    jobId,
    phase: "generating",
  });

  const markdown = await generateMarkdown(kind, {
    resumeText,
    profile,
    job: {
      title: job.title,
      company: job.company,
      location: job.location,
      summary: job.summary,
      url: job.url,
    },
    modelSelection,
  });

  const existing = await db.select().from(documents).where(eq(documents.jobId, jobId)).all();
  const prior = existing.find((doc) => doc.kind === documentKind);

  const timestamp = new Date().toISOString();
  let documentId: string;

  if (prior) {
    documentId = prior.id;
    await db
      .update(documents)
      .set({ content: markdown, name: documentName(kind, job.company, job.title) })
      .where(eq(documents.id, documentId))
      .run();
  } else {
    documentId = makeId("doc");
    await db.insert(documents).values({
      id: documentId,
      projectId,
      jobId,
      kind: documentKind,
      mimeType: "text/markdown",
      name: documentName(kind, job.company, job.title),
      path: `/tmp/${documentId}.md`,
      content: markdown,
      createdAt: timestamp,
    });
  }

  await writeProjectRuntimeEvent(projectId, "task.progress", {
    taskId,
    taskType: kind,
    jobId,
    phase: "completed",
    documentId,
  });
}

function documentName(kind: TailoringKind, company: string, title: string): string {
  const prefix = kind === "resume_tailoring" ? "Tailored resume" : "Cover letter";
  return `${prefix} — ${company} — ${title}`;
}

interface GenerateContext {
  resumeText: string;
  profile: StructuredProfile | null;
  job: {
    title: string;
    company: string;
    location: string;
    summary: string;
    url: string;
  };
  modelSelection?: ChatModelSelection;
}

async function generateMarkdown(kind: TailoringKind, ctx: GenerateContext): Promise<string> {
  const prompt = buildPrompt(kind, ctx);
  const text = await runOneShotPrompt({
    label: "tailoring",
    prompt,
    modelSelection: ctx.modelSelection,
    timeoutMs: TAILORING_TIMEOUT_MS,
  });
  if (!text) {
    throw new Error("No AI provider available for tailoring (set CODEX_BIN or ANTHROPIC_API_KEY).");
  }
  return stripFences(text);
}

function buildPrompt(kind: TailoringKind, ctx: GenerateContext): string {
  const profileBlock = ctx.profile
    ? `<profile>\n${JSON.stringify(ctx.profile, null, 2)}\n</profile>`
    : "";
  const resumeBlock = ctx.resumeText ? `<resume>\n${ctx.resumeText}\n</resume>` : "";
  const jobBlock = `<job>\nTitle: ${ctx.job.title}\nCompany: ${ctx.job.company}\nLocation: ${ctx.job.location}\nURL: ${ctx.job.url}\n\n${ctx.job.summary}\n</job>`;

  const instruction =
    kind === "resume_tailoring"
      ? `Produce a tailored resume in Markdown for the above job. Use the candidate's real experience from <resume>/<profile>. Emphasise the skills and achievements most relevant to the job. Use this structure:

# Candidate Name

Short headline line (role target · location · contact links inline).

## Summary

One paragraph, 2-4 sentences, tailored to the job.

## Experience

### Role — Company (dates)

- Bullet: impact-first, quantified where possible, aligned to the job.
- 3-6 bullets per role.

## Skills

- Comma-separated lists grouped by category where useful.

## Education

### Degree — Institution (dates)

Return only the Markdown. No commentary, no code fences.`
      : `Write a cover letter in Markdown addressed to the hiring manager at the above company. Keep it 3-4 short paragraphs, specific to this job, grounded in the candidate's real background. Open with why this role, middle with 2-3 concrete examples of relevant impact, close with a call to conversation. No fluff. No code fences. Return only the Markdown.`;

  return [jobBlock, profileBlock, resumeBlock, instruction].filter(Boolean).join("\n\n");
}
