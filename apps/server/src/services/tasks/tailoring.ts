import { eq } from "drizzle-orm";
import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";
import { CODEX_MODELS, CLAUDE_MODELS } from "@jobseeker/contracts";

import { db } from "../../db";
import { documents, jobs } from "../../db/schema";
import { env } from "../../env";
import { makeId } from "../../lib/ids";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { writeProjectRuntimeEvent } from "../runtimeEvents";

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

  const codexAvailable = isCodexAvailable();
  const claudeAvailable = Boolean(env.ANTHROPIC_API_KEY);

  const tryCodexFirst = !ctx.modelSelection?.provider || ctx.modelSelection.provider === "codex";
  const tryClaudeFallback =
    !ctx.modelSelection?.provider || ctx.modelSelection.provider === "claude";

  if (tryCodexFirst && codexAvailable) {
    const model = ctx.modelSelection?.model ?? CODEX_MODELS[0].slug;
    const modelDef = CODEX_MODELS.find((m) => m.slug === model) ?? CODEX_MODELS[0];
    const effort = ctx.modelSelection?.effort ?? modelDef.capabilities.defaultEffort;
    const result = await tryCodex(prompt, model, effort);
    if (result) return stripFences(result);
  }

  if (tryClaudeFallback && claudeAvailable) {
    const model =
      ctx.modelSelection?.provider === "claude" && ctx.modelSelection.model
        ? ctx.modelSelection.model
        : CLAUDE_MODELS[0].slug;
    const result = await tryClaude(prompt, model);
    if (result) return stripFences(result);
  }

  throw new Error("No AI provider available for tailoring (set CODEX_BIN or ANTHROPIC_API_KEY).");
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

function isCodexAvailable(): boolean {
  const binPath = process.env.CODEX_BIN ?? "codex";
  try {
    const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function tryCodex(prompt: string, model: string, effort?: string): Promise<string | null> {
  const binPath = process.env.CODEX_BIN ?? "codex";
  const args = [binPath, "exec", "--ephemeral", "-s", "read-only", "--model", model];
  if (effort) args.push("--config", `model_reasoning_effort="${effort}"`);
  args.push("-");

  try {
    const timeoutMs = 3 * 60 * 1000;
    const proc = Bun.spawn(args, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(new TextEncoder().encode(prompt));
    proc.stdin.end();

    const stdoutPromise = new Response(proc.stdout).text();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Codex tailoring timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const stdout = await Promise.race([stdoutPromise, timeout]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    return stdout.trim() || null;
  } catch (error) {
    console.error("Tailoring via codex failed:", error);
    return null;
  }
}

async function tryClaude(prompt: string, model: string): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const MODEL_MAP: Record<string, string> = {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6": "claude-sonnet-4-6-20250514",
  };
  const apiModel = MODEL_MAP[model] ?? model;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: apiModel,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].type === "text" ? response.content[0].text : null;
  } catch (error) {
    console.error("Tailoring via Claude failed:", error);
    return null;
  }
}

function stripFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}
