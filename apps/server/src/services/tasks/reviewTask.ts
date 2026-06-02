import { and, eq } from "drizzle-orm";
import type { ChatModelSelection } from "@jobseeker/contracts";

import { db } from "../../db";
import { documents, jobs } from "../../db/schema";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { reviewTailoredDoc } from "./recruiterReview";
import {
  docKindForTailoring,
  formatJobBlock,
  persistReview,
  reviewSkillForTailoring,
  type TailoringKind,
} from "./reviewStore";

/**
 * Re-runs the recruiter review against the CURRENT saved document (which the
 * user may have hand-edited), without regenerating it. Appends to the review
 * history and refreshes the surfaced latest review.
 */
export async function runReviewTask(input: {
  projectId: string;
  taskId: string;
  jobId?: string;
  kind: TailoringKind;
  modelSelection?: ChatModelSelection;
}): Promise<void> {
  const { projectId, taskId, jobId, kind, modelSelection } = input;
  if (!jobId) throw new Error("jobId is required for a tailoring review");

  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) throw new Error(`Job ${jobId} not found`);

  const documentKind = docKindForTailoring(kind);
  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.jobId, jobId), eq(documents.kind, documentKind)))
    .get();
  if (!doc?.content) {
    throw new Error(`No ${documentKind} to review for this job`);
  }

  await progress(projectId, taskId, kind, jobId, "reviewing");

  const verdict = await reviewTailoredDoc({
    docMarkdown: doc.content,
    jobBlock: formatJobBlock({
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      text: job.descriptionText ?? job.summary,
    }),
    reviewSkill: reviewSkillForTailoring(kind),
    modelSelection,
  });
  if (!verdict) {
    throw new Error("No AI provider available for the recruiter review.");
  }

  await persistReview({ projectId, jobId, kind, documentId: doc.id, verdict });
  await progress(projectId, taskId, kind, jobId, "completed", { documentId: doc.id });
}

function progress(
  projectId: string,
  taskId: string,
  taskType: TailoringKind,
  jobId: string,
  phase: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  return writeProjectRuntimeEvent(projectId, "task.progress", {
    taskId,
    taskType,
    jobId,
    phase,
    ...extra,
  });
}
