import { eq } from "drizzle-orm";
import type { ChatModelSelection, StructuredProfile, TailoringIssue } from "@jobseeker/contracts";

import { db } from "../../db";
import { documents, jobs } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { runOneShotPrompt, stripFences } from "../llm/oneShotPrompt";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { loadSkill, type SkillName } from "../skills/loadSkill";
import { reviewTailoredDoc, type RecruiterVerdict } from "./recruiterReview";
import { formatJobBlock, persistReview } from "./reviewStore";

const TAILORING_TIMEOUT_MS = 3 * 60 * 1000;
/** Stop revising once the recruiter scores the resume at or above this. */
const REVIEW_TARGET_SCORE = 85;
/** Max draft→review→revise cycles after the first draft. */
const MAX_REVISE_PASSES = 2;

type TailoringKind = "resume_tailoring" | "cover_letter_tailoring";

interface TailoringInput {
  projectId: string;
  taskId: string;
  jobId?: string;
  kind: TailoringKind;
  modelSelection?: ChatModelSelection;
}

interface JobContext {
  title: string;
  company: string;
  location: string;
  summary: string;
  url: string;
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

  await progress(projectId, taskId, kind, jobId, "loading_context");

  const resumeText = (await getProjectResumeText(projectId)) ?? "";
  const profile = await readProjectProfile(projectId);
  const documentKind = kind === "resume_tailoring" ? "tailored_resume" : "cover_letter";
  const jobCtx: JobContext = {
    title: job.title,
    company: job.company,
    location: job.location,
    summary: job.descriptionText ?? job.summary,
    url: job.url,
  };

  await progress(projectId, taskId, kind, jobId, "generating");

  // Both kinds run the skill-driven craft + recruiter-review loop.
  const { markdown, verdict } = await craftWithReview(kind, {
    job: jobCtx,
    profile,
    resumeText,
    modelSelection,
    onReviewing: () => progress(projectId, taskId, kind, jobId, "reviewing"),
  });

  const documentId = await upsertDocument({
    projectId,
    jobId,
    documentKind,
    name: documentName(kind, job.company, job.title),
    markdown,
  });

  if (verdict) {
    await persistReview({ projectId, jobId, kind, documentId, verdict });
  }

  await progress(projectId, taskId, kind, jobId, "completed", { documentId });
}

async function progress(
  projectId: string,
  taskId: string,
  taskType: TailoringKind,
  jobId: string,
  phase: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await writeProjectRuntimeEvent(projectId, "task.progress", {
    taskId,
    taskType,
    jobId,
    phase,
    ...extra,
  });
}

interface CraftContext {
  job: JobContext;
  profile: StructuredProfile | null;
  resumeText: string;
  modelSelection?: ChatModelSelection;
  onReviewing: () => void | Promise<void>;
}

interface CraftSpec {
  craftSkill: SkillName;
  reviewSkill: SkillName;
  docNoun: string;
  produceInstruction: string;
}

const CRAFT_SPECS: Record<TailoringKind, CraftSpec> = {
  resume_tailoring: {
    craftSkill: "resume-craft",
    reviewSkill: "recruiter-review",
    docNoun: "resume",
    produceInstruction: "Produce a tailored resume in Markdown for this job, following your skill.",
  },
  cover_letter_tailoring: {
    craftSkill: "cover-letter",
    reviewSkill: "cover-letter-review",
    docNoun: "cover letter",
    produceInstruction:
      "Write a tailored cover letter in Markdown for this job, following your skill.",
  },
};

/**
 * Drafts a tailored document with its craft skill, then loops the recruiter
 * reviewer: while the score is below target and passes remain, it revises from
 * the critique and re-reviews. The returned verdict always reflects the final
 * markdown. Shared by resume and cover-letter tailoring.
 */
async function craftWithReview(
  kind: TailoringKind,
  ctx: CraftContext,
): Promise<{ markdown: string; verdict: RecruiterVerdict | null }> {
  const spec = CRAFT_SPECS[kind];
  const skill = loadSkill(spec.craftSkill);
  const jobBlock = buildJobBlock(ctx.job);
  const contextBlock = buildContextBlock(ctx.job, ctx.profile);
  const tag = `current-${spec.docNoun.replace(/\s+/g, "-")}`;
  const baseBlocks = [
    jobBlock,
    profileBlock(ctx.profile),
    resumeBlock(ctx.resumeText),
    contextBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  let markdown = await generate(
    skill,
    `${baseBlocks}\n\n${spec.produceInstruction}`,
    ctx.modelSelection,
  );

  let verdict = await reviewTailoredDoc({
    docMarkdown: markdown,
    jobBlock,
    reviewSkill: spec.reviewSkill,
    modelSelection: ctx.modelSelection,
  });

  let passes = 0;
  while (verdict && verdict.score < REVIEW_TARGET_SCORE && passes < MAX_REVISE_PASSES) {
    await ctx.onReviewing();
    markdown = await generate(
      skill,
      [
        jobBlock,
        contextBlock,
        `<${tag}>`,
        markdown,
        `</${tag}>`,
        "",
        "A recruiter flagged these issues:",
        formatIssues(verdict.issues),
        "",
        `Revise the ${spec.docNoun} to fix every issue while keeping it truthful. Return only the Markdown.`,
      ].join("\n"),
      ctx.modelSelection,
    );
    verdict = await reviewTailoredDoc({
      docMarkdown: markdown,
      jobBlock,
      reviewSkill: spec.reviewSkill,
      modelSelection: ctx.modelSelection,
    });
    passes += 1;
  }

  return { markdown, verdict };
}

async function generate(
  systemPrompt: string,
  prompt: string,
  modelSelection?: ChatModelSelection,
): Promise<string> {
  const text = await runOneShotPrompt({
    label: "tailoring",
    systemPrompt,
    prompt,
    modelSelection,
    timeoutMs: TAILORING_TIMEOUT_MS,
  });
  if (!text) {
    throw new Error("No AI provider available for tailoring (set CODEX_BIN or ANTHROPIC_API_KEY).");
  }
  return stripFences(text);
}

function buildJobBlock(job: JobContext): string {
  return formatJobBlock({
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    text: job.summary,
  });
}

function profileBlock(profile: StructuredProfile | null): string {
  return profile ? `<profile>\n${JSON.stringify(profile, null, 2)}\n</profile>` : "";
}

function resumeBlock(resumeText: string): string {
  return resumeText ? `<resume>\n${resumeText}\n</resume>` : "";
}

/** Country + industry cues so the writer respects local conventions. */
function buildContextBlock(job: JobContext, profile: StructuredProfile | null): string {
  const country = guessCountry(job.location);
  const industries = profile?.targeting.companyPreference.industries ?? [];
  const lines = [
    `Company location: ${job.location || "unknown"}`,
    country ? `Country/region: ${country}` : "Country/region: infer from the location",
    industries.length
      ? `Industry: ${industries.join(", ")}`
      : "Industry: infer from the job description",
    "Use this country's resume conventions and this industry's expectations.",
  ];
  return `<context>\n${lines.join("\n")}\n</context>`;
}

/** Best-effort country from a free-form location ("Sydney, NSW, Australia"). */
function guessCountry(location: string): string | null {
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

function formatIssues(issues: TailoringIssue[]): string {
  if (issues.length === 0) return "- (no specific issues listed)";
  return issues.map((i) => `- [${i.severity}] ${i.issue}${i.fix ? ` → ${i.fix}` : ""}`).join("\n");
}

async function upsertDocument(input: {
  projectId: string;
  jobId: string;
  documentKind: "tailored_resume" | "cover_letter";
  name: string;
  markdown: string;
}): Promise<string> {
  const existing = await db.select().from(documents).where(eq(documents.jobId, input.jobId)).all();
  const prior = existing.find((doc) => doc.kind === input.documentKind);

  if (prior) {
    await db
      .update(documents)
      .set({ content: input.markdown, name: input.name })
      .where(eq(documents.id, prior.id))
      .run();
    return prior.id;
  }

  const documentId = makeId("doc");
  await db.insert(documents).values({
    id: documentId,
    projectId: input.projectId,
    jobId: input.jobId,
    kind: input.documentKind,
    mimeType: "text/markdown",
    name: input.name,
    path: `/tmp/${documentId}.md`,
    content: input.markdown,
    createdAt: new Date().toISOString(),
  });
  return documentId;
}

function documentName(kind: TailoringKind, company: string, title: string): string {
  const prefix = kind === "resume_tailoring" ? "Tailored resume" : "Cover letter";
  return `${prefix} — ${company} — ${title}`;
}
