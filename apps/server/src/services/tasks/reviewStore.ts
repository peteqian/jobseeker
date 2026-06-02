import { sql } from "drizzle-orm";

import { db } from "../../db";
import { tailoringReviewHistory, tailoringReviews } from "../../db/schema";
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
  const createdAt = new Date().toISOString();

  await db
    .insert(tailoringReviews)
    .values({
      projectId: input.projectId,
      jobId: input.jobId,
      kind: input.kind,
      documentId: input.documentId,
      score: input.verdict.score,
      issuesJson,
      createdAt,
    })
    .onConflictDoUpdate({
      target: [tailoringReviews.projectId, tailoringReviews.jobId, tailoringReviews.kind],
      set: {
        documentId: sql`excluded.document_id`,
        score: sql`excluded.score`,
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
    score: input.verdict.score,
    issuesJson,
    createdAt,
  });
}
