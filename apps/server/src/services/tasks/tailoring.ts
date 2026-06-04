import { eq } from "drizzle-orm";
import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";
import type { PdfVariant } from "@jobseeker/resume-pdf";

import { db } from "../../db";
import { logWarn } from "../../lib/log";
import { countPdfPages } from "../pdf/pageCount";
import { documents, jobs } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { runOneShotPrompt, stripFences } from "../llm/oneShotPrompt";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { loadSkill, type SkillName } from "../skills/loadSkill";
import { reviewTailoredDoc, type RecruiterVerdict } from "./recruiterReview";
import { formatCandidateBlocks, formatJobBlock, persistReview } from "./reviewStore";

const TAILORING_TIMEOUT_MS = 3 * 60 * 1000;
/**
 * Stop revising once the recruiter's presentationScore reaches this. The loop
 * deliberately ignores fitScore — fit is a fact about the candidate vs the
 * role and no amount of editing moves it; presentation is always fixable.
 */
const PRESENTATION_TARGET_SCORE = 90;
/** Hard cap on rendered pages by kind. Over this, content is trimmed and re-checked. */
const MAX_PAGES: Record<TailoringKind, number> = {
  resume_tailoring: 2,
  cover_letter_tailoring: 1,
};
/**
 * Max draft→review→revise cycles after the first draft. Higher than the
 * quality-only loop needed because trimming to the page limit can take several
 * cut-and-recheck passes.
 */
const MAX_REVISE_PASSES = 4;
/**
 * Stop revising after this many consecutive passes with no rank improvement.
 * Reviews that plateau below target usually mean the remaining issues are
 * unfixable (candidate genuinely lacks something) — more passes only add noise.
 */
const MAX_STAGNANT_PASSES = 2;

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
    onProgress: (phase, extra) => progress(projectId, taskId, kind, jobId, phase, extra),
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

  await progress(projectId, taskId, kind, jobId, "completed", {
    documentId,
    score: verdict?.presentationScore ?? null,
    fitScore: verdict?.fitScore ?? null,
    shortlist: verdict?.shortlist ?? null,
  });
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
  onProgress: (phase: string, extra?: Record<string, unknown>) => void | Promise<void>;
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
  const candidateBlocks = formatCandidateBlocks(ctx.profile, ctx.resumeText);
  const baseBlocks = [jobBlock, candidateBlocks, contextBlock].filter(Boolean).join("\n\n");

  const pdfVariant: PdfVariant = kind === "resume_tailoring" ? "resume" : "cover-letter";
  const maxPages = MAX_PAGES[kind];

  let markdown = await generate(
    skill,
    `${baseBlocks}\n\n${spec.produceInstruction}`,
    ctx.modelSelection,
  );

  await ctx.onProgress("reviewing", { pass: 1 });
  let verdict = await reviewTailoredDoc({
    docMarkdown: markdown,
    jobBlock,
    candidateBlocks,
    reviewSkill: spec.reviewSkill,
    modelSelection: ctx.modelSelection,
  });
  let pages = await safePageCount(markdown, pdfVariant);

  // Track the best draft seen so far. Reviews are noisy (a revision can score
  // lower than the draft it replaced), so we return the highest-ranked draft
  // rather than blindly returning the last one.
  let best = { markdown, verdict, pages };

  // Revise while the recruiter score is below target OR the document overflows
  // the page limit. The page count is measured from the real rendered PDF, so
  // overflow is a hard fact, not the model's guess.
  let passes = 0;
  let stagnantPasses = 0;
  while (
    ((verdict && verdict.presentationScore < PRESENTATION_TARGET_SCORE) || pages > maxPages) &&
    passes < MAX_REVISE_PASSES &&
    stagnantPasses < MAX_STAGNANT_PASSES
  ) {
    await ctx.onProgress("revising", {
      pass: passes + 1,
      score: verdict?.presentationScore ?? null,
      fitScore: verdict?.fitScore ?? null,
      issueCount: verdict?.issues.length ?? 0,
      pages,
      maxPages,
    });
    const fixes: string[] = [];
    if (pages > maxPages) {
      const pageWord = maxPages === 1 ? "page" : "pages";
      fixes.push(
        `This ${spec.docNoun} renders to ${pages} pages but MUST fit on ${maxPages} ${pageWord}. ` +
          `Cut the weakest, least relevant content and tighten wording until it fits on ` +
          `${maxPages} ${pageWord}. Do not shrink type — cut content.`,
      );
    }
    if (verdict && verdict.presentationScore < PRESENTATION_TARGET_SCORE) {
      // Hand the verdict over as structured JSON so the crafter consumes each
      // issue's "fix" as an explicit instruction instead of re-interpreting
      // prose. Gaps are deliberately excluded — they are candidate-vs-role
      // facts the writer must not try to "fix" by stretching the truth.
      fixes.push(
        `A recruiter reviewed this ${spec.docNoun} and returned the verdict below as JSON. ` +
          `Treat each issue's "fix" field as a concrete instruction and apply every one, ` +
          `starting with "high" severity:\n<review-verdict>\n${JSON.stringify(
            { presentationScore: verdict.presentationScore, issues: verdict.issues },
            null,
            2,
          )}\n</review-verdict>`,
      );
    }
    markdown = await generate(
      skill,
      [
        jobBlock,
        // Candidate ground truth must travel with every revise pass — without
        // it the crafter cannot pull real skills/experience the draft omitted,
        // only reshuffle what is already there, and review fixes like "add the
        // job's keywords where genuine" become impossible to apply.
        candidateBlocks,
        contextBlock,
        `<${tag}>`,
        markdown,
        `</${tag}>`,
        "",
        ...fixes,
        "",
        `Make targeted edits to the ${spec.docNoun} above that address every point. ` +
          `Do NOT rewrite sections the review did not flag — unflagged content is ` +
          `already good; changing it risks new issues. Keep it truthful and tailored. ` +
          `Return only the full revised Markdown.`,
      ]
        .filter(Boolean)
        .join("\n"),
      ctx.modelSelection,
    );
    await ctx.onProgress("reviewing", { pass: passes + 2 });
    verdict = await reviewTailoredDoc({
      docMarkdown: markdown,
      jobBlock,
      candidateBlocks,
      reviewSkill: spec.reviewSkill,
      modelSelection: ctx.modelSelection,
    });
    pages = await safePageCount(markdown, pdfVariant);
    passes += 1;

    if (draftRank({ verdict, pages }, maxPages) > draftRank(best, maxPages)) {
      best = { markdown, verdict, pages };
      stagnantPasses = 0;
    } else if (pages <= maxPages) {
      // Quality-only loop is treading water — stop burning passes. Over-limit
      // drafts are exempt: page trimming legitimately takes several passes
      // whose progress (4 pages → 3) isn't visible to draftRank.
      stagnantPasses += 1;
    }
  }

  if (best.pages > maxPages) {
    logWarn("tailoring still over page limit after revisions", {
      docNoun: spec.docNoun,
      pages: best.pages,
      maxPages,
      passes,
    });
  }

  return { markdown: best.markdown, verdict: best.verdict };
}

/**
 * Ranks a draft for best-of selection: fitting the page limit dominates
 * (a page count of 0 means "unknown" and is treated as fitting), then the
 * recruiter's presentationScore breaks ties.
 */
function draftRank(
  draft: { verdict: RecruiterVerdict | null; pages: number },
  maxPages: number,
): number {
  const fits = draft.pages <= maxPages ? 1 : 0;
  return fits * 1000 + (draft.verdict?.presentationScore ?? 0);
}

/** Page count from the rendered PDF; never blocks generation if rendering fails. */
async function safePageCount(markdown: string, variant: PdfVariant): Promise<number> {
  try {
    return await countPdfPages(markdown, variant);
  } catch (error) {
    logWarn("page-count render failed; skipping length check", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
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
