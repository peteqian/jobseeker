import { eq, sql } from "drizzle-orm";
import type { StructuredProfile, TailoringIssue, TailoringShortlist } from "@jobseeker/contracts";

import { db } from "../../db";
import { jobs, tailoringReviewHistory, tailoringReviews } from "../../db/schema";
import { makeId } from "../../lib/ids";
import type { SkillName } from "../skills/loadSkill";
import type { RecruiterVerdict } from "./recruiterReview";

export type TailoringKind = "resume_tailoring" | "cover_letter_tailoring";

export function docKindForTailoring(kind: TailoringKind): "tailored_resume" | "cover_letter" {
  return kind === "resume_tailoring" ? "tailored_resume" : "cover_letter";
}

export function reviewSkillForTailoring(kind: TailoringKind): SkillName {
  return kind === "resume_tailoring" ? "recruiter-review" : "cover-letter-review";
}

/** Builds the `<job>` block fed to craft and review prompts. */
export function formatJobBlock(input: {
  title: string;
  company: string;
  location: string;
  url: string;
  text: string;
}): string {
  return `<job>\nTitle: ${input.title}\nCompany: ${input.company}\nLocation: ${input.location}\nURL: ${input.url}\n\n${input.text}\n</job>`;
}

/**
 * Builds the candidate ground-truth blocks (`<profile>` + `<resume>`) fed to
 * craft and review prompts. Empty string when neither source exists.
 */
export function formatCandidateBlocks(
  profile: StructuredProfile | null,
  resumeText: string,
): string {
  const profileBlock = profile ? `<profile>\n${JSON.stringify(profile, null, 2)}\n</profile>` : "";
  const resumeBlock = resumeText ? `<resume>\n${resumeText}\n</resume>` : "";
  return [profileBlock, resumeBlock].filter(Boolean).join("\n\n");
}

/**
 * Records a recruiter verdict: upserts the latest review (the surfaced panel)
 * and appends an immutable history row (the score timeline). Shared by the
 * tailoring generate flow and the standalone re-run task.
 */
export async function persistReview(input: {
  projectId: string;
  jobId: string;
  kind: TailoringKind;
  documentId: string;
  verdict: RecruiterVerdict;
}): Promise<void> {
  const issuesJson = JSON.stringify(input.verdict.issues);
  const gapsJson = JSON.stringify(input.verdict.gaps);
  const createdAt = new Date().toISOString();

  await db
    .insert(tailoringReviews)
    .values({
      projectId: input.projectId,
      jobId: input.jobId,
      kind: input.kind,
      documentId: input.documentId,
      score: input.verdict.presentationScore,
      fitScore: input.verdict.fitScore,
      shortlist: input.verdict.shortlist,
      gapsJson,
      issuesJson,
      createdAt,
    })
    .onConflictDoUpdate({
      target: [tailoringReviews.projectId, tailoringReviews.jobId, tailoringReviews.kind],
      set: {
        documentId: sql`excluded.document_id`,
        score: sql`excluded.score`,
        fitScore: sql`excluded.fit_score`,
        shortlist: sql`excluded.shortlist`,
        gapsJson: sql`excluded.gaps_json`,
        issuesJson: sql`excluded.issues_json`,
        createdAt: sql`excluded.created_at`,
      },
    });

  await db.insert(tailoringReviewHistory).values({
    id: makeId("trev"),
    projectId: input.projectId,
    jobId: input.jobId,
    kind: input.kind,
    documentId: input.documentId,
    score: input.verdict.presentationScore,
    fitScore: input.verdict.fitScore,
    shortlist: input.verdict.shortlist,
    gapsJson,
    issuesJson,
    createdAt,
  });
}

export interface TailoringReviewSummary {
  jobTitle: string;
  company: string;
  kind: TailoringKind;
  /** Presentation quality of the document (the revise loop's target). */
  score: number;
  /** Candidate-vs-role fit; null on reviews from before the fit/presentation split. */
  fitScore: number | null;
  shortlist: TailoringShortlist | null;
  /** Unfixable candidate-vs-role mismatches stated as facts. */
  gaps: string[];
  issues: TailoringIssue[];
  createdAt: string;
}

/**
 * Latest recruiter verdict per job + document kind, joined with the job so the
 * assistant can reference reviews by role. Powers the chat system prompt.
 */
export async function listLatestReviews(projectId: string): Promise<TailoringReviewSummary[]> {
  const rows = await db
    .select({
      jobTitle: jobs.title,
      company: jobs.company,
      kind: tailoringReviews.kind,
      score: tailoringReviews.score,
      fitScore: tailoringReviews.fitScore,
      shortlist: tailoringReviews.shortlist,
      gapsJson: tailoringReviews.gapsJson,
      issuesJson: tailoringReviews.issuesJson,
      createdAt: tailoringReviews.createdAt,
    })
    .from(tailoringReviews)
    .innerJoin(jobs, eq(tailoringReviews.jobId, jobs.id))
    .where(eq(tailoringReviews.projectId, projectId))
    .all();

  return rows.map((row) => ({
    jobTitle: row.jobTitle,
    company: row.company,
    kind: row.kind as TailoringKind,
    score: row.score,
    fitScore: row.fitScore,
    shortlist: parseShortlist(row.shortlist),
    gaps: parseStringArray(row.gapsJson),
    issues: parseJsonArray<TailoringIssue>(row.issuesJson),
    createdAt: row.createdAt,
  }));
}

const SHORTLIST_VALUES = new Set<TailoringShortlist>(["strong_yes", "yes", "maybe", "no"]);

export function parseShortlist(value: string | null): TailoringShortlist | null {
  return SHORTLIST_VALUES.has(value as TailoringShortlist) ? (value as TailoringShortlist) : null;
}

export function parseStringArray(json: string | null): string[] {
  return parseJsonArray<unknown>(json).filter((g): g is string => typeof g === "string");
}

export function parseJsonArray<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
