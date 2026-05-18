import { desc, eq } from "drizzle-orm";
import type {
  ChatModelSelection,
  CoachAnchorType,
  CoachClaim,
  CoachClaimStatus,
  CoachGap,
  CoachGapSeverity,
  CoachNextStep,
  CoachReview,
  CoachSuggestion,
} from "@jobseeker/contracts";

import { db } from "../../db";
import {
  coachClaims,
  coachGaps,
  coachNextSteps,
  coachReviewJds,
  coachReviews,
  coachSuggestions,
  jobs,
} from "../../db/schema";
import { makeId } from "../../lib/ids";
import {
  buildCoachDeepReviewUserMessage,
  buildCoachReviewUserMessage,
  COACH_DEEP_REVIEW_SYSTEM_PROMPT,
  COACH_REVIEW_SYSTEM_PROMPT,
} from "../../prompts/coach";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { getProjectResumeText } from "../projects/resume";

interface RawClaim {
  text: string;
  status: CoachClaimStatus;
  statusReason: string;
  suggestions?: string[];
}

interface RawGap {
  topic: string;
  evidenceSummary: string;
  discussionSeed: string;
  severity: CoachGapSeverity;
}

interface RawReview {
  focusArea: string;
  score: number;
  claims: RawClaim[];
  nextSteps: string[];
  gaps?: RawGap[];
}

interface AssembledJd {
  source: "paste" | "explorer";
  text: string;
}

export interface RunCoachReviewOptions {
  projectId: string;
  resumeDocId: string;
  focusArea: string;
  deep?: boolean;
  pastedJds?: string[];
  useExplorer?: boolean;
  modelSelection?: ChatModelSelection;
}

/**
 * Runs a coach review.
 *
 * Basic mode: resume-only critique with claims + suggestions + next steps.
 * Deep mode: grounds the critique in target job descriptions (pasted by the
 * user and/or pulled from the project's explorer corpus). Deep mode also
 * returns a gaps[] with discussion seeds for the coach chat.
 */
export async function runCoachReview(options: RunCoachReviewOptions): Promise<CoachReview | null> {
  const resumeText = await getProjectResumeText(options.projectId);
  if (!resumeText) return null;

  if (options.deep) {
    const jds = await assembleJds(options.projectId, options.pastedJds, options.useExplorer);
    const raw = await callDeepModel(resumeText, jds, options.focusArea);
    if (!raw) return null;
    return persistReview(options.projectId, options.resumeDocId, raw, jds);
  }

  const raw = await callBasicModel(resumeText, options.focusArea);
  if (!raw) return null;
  return persistReview(options.projectId, options.resumeDocId, raw, []);
}

async function assembleJds(
  projectId: string,
  pastedJds: string[] | undefined,
  useExplorer: boolean | undefined,
): Promise<AssembledJd[]> {
  const out: AssembledJd[] = [];

  for (const text of pastedJds ?? []) {
    const trimmed = text.trim();
    if (trimmed) out.push({ source: "paste", text: trimmed });
  }

  if (useExplorer) {
    const rows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.projectId, projectId))
      .orderBy(desc(jobs.createdAt))
      .limit(5)
      .all();
    for (const row of rows) {
      const text = `${row.title} @ ${row.company}\n\n${row.summary}`;
      out.push({ source: "explorer", text });
    }
  }

  return out;
}

async function callBasicModel(resumeText: string, focusArea: string): Promise<RawReview | null> {
  const text = await runOneShotPrompt({
    label: "coach_review",
    systemPrompt: COACH_REVIEW_SYSTEM_PROMPT,
    prompt: buildCoachReviewUserMessage(resumeText, focusArea),
  });
  return text ? parseJsonResponse<RawReview>(text, "coach_review") : null;
}

async function callDeepModel(
  resumeText: string,
  jds: AssembledJd[],
  focusArea: string,
): Promise<RawReview | null> {
  const text = await runOneShotPrompt({
    label: "coach_deep_review",
    systemPrompt: COACH_DEEP_REVIEW_SYSTEM_PROMPT,
    prompt: buildCoachDeepReviewUserMessage(resumeText, jds, focusArea),
  });
  return text ? parseJsonResponse<RawReview>(text, "coach_deep_review") : null;
}

async function persistReview(
  projectId: string,
  resumeDocId: string,
  raw: RawReview,
  jds: AssembledJd[],
): Promise<CoachReview> {
  const timestamp = new Date().toISOString();
  const reviewId = makeId("creview");
  const issuesCount = raw.claims.filter((c) => c.status !== "strong").length;

  await db.insert(coachReviews).values({
    id: reviewId,
    projectId,
    resumeDocId,
    focusArea: raw.focusArea,
    score: raw.score,
    issuesCount,
    createdAt: timestamp,
  });

  const claims: CoachClaim[] = raw.claims.map((c) => ({
    id: makeId("cclaim"),
    reviewId,
    text: c.text,
    status: c.status,
    statusReason: c.statusReason,
    createdAt: timestamp,
  }));

  if (claims.length > 0) {
    await db.insert(coachClaims).values(
      claims.map((claim) => ({
        id: claim.id,
        reviewId: claim.reviewId,
        text: claim.text,
        status: claim.status,
        statusReason: claim.statusReason,
        createdAt: claim.createdAt,
      })),
    );
  }

  const suggestions: CoachSuggestion[] = [];
  raw.claims.forEach((rawClaim, index) => {
    const claim = claims[index];
    for (const text of rawClaim.suggestions ?? []) {
      suggestions.push({
        id: makeId("csug"),
        claimId: claim.id,
        text,
        createdAt: timestamp,
      });
    }
  });

  if (suggestions.length > 0) {
    await db.insert(coachSuggestions).values(suggestions);
  }

  const nextSteps: CoachNextStep[] = raw.nextSteps.map((text) => ({
    id: makeId("cstep"),
    reviewId,
    text,
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  if (nextSteps.length > 0) {
    await db.insert(coachNextSteps).values(nextSteps);
  }

  const gaps: CoachGap[] = (raw.gaps ?? []).map((g) => ({
    id: makeId("cgap"),
    reviewId,
    topic: g.topic,
    evidenceSummary: g.evidenceSummary,
    discussionSeed: g.discussionSeed,
    severity: g.severity,
    createdAt: timestamp,
  }));

  if (gaps.length > 0) {
    await db.insert(coachGaps).values(gaps);
  }

  if (jds.length > 0) {
    await db.insert(coachReviewJds).values(
      jds.map((jd) => ({
        id: makeId("cjd"),
        reviewId,
        source: jd.source,
        text: jd.text,
        createdAt: timestamp,
      })),
    );
  }

  return {
    id: reviewId,
    projectId,
    resumeDocId,
    focusArea: raw.focusArea,
    score: raw.score,
    issuesCount,
    createdAt: timestamp,
    claims,
    suggestions,
    nextSteps,
    gaps,
  };
}

export async function getLatestCoachReview(projectId: string): Promise<CoachReview | null> {
  const review = await db
    .select()
    .from(coachReviews)
    .where(eq(coachReviews.projectId, projectId))
    .orderBy(desc(coachReviews.createdAt))
    .limit(1)
    .get();
  if (!review) return null;

  const claimRows = await db
    .select()
    .from(coachClaims)
    .where(eq(coachClaims.reviewId, review.id))
    .all();

  const claims: CoachClaim[] = claimRows.map((row) => ({
    id: row.id,
    reviewId: row.reviewId,
    text: row.text,
    status: row.status as CoachClaimStatus,
    statusReason: row.statusReason,
    createdAt: row.createdAt,
  }));

  const suggestions: CoachSuggestion[] = [];
  for (const claim of claims) {
    const rows = await db
      .select()
      .from(coachSuggestions)
      .where(eq(coachSuggestions.claimId, claim.id))
      .all();
    for (const row of rows) {
      suggestions.push({
        id: row.id,
        claimId: row.claimId,
        text: row.text,
        createdAt: row.createdAt,
      });
    }
  }

  const stepRows = await db
    .select()
    .from(coachNextSteps)
    .where(eq(coachNextSteps.reviewId, review.id))
    .all();

  const nextSteps: CoachNextStep[] = stepRows.map((row) => ({
    id: row.id,
    reviewId: row.reviewId,
    text: row.text,
    completed: row.completed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const gapRows = await db.select().from(coachGaps).where(eq(coachGaps.reviewId, review.id)).all();

  const gaps: CoachGap[] = gapRows.map((row) => ({
    id: row.id,
    reviewId: row.reviewId,
    topic: row.topic,
    evidenceSummary: row.evidenceSummary,
    discussionSeed: row.discussionSeed,
    severity: row.severity as CoachGapSeverity,
    createdAt: row.createdAt,
  }));

  return {
    id: review.id,
    projectId: review.projectId,
    resumeDocId: review.resumeDocId,
    focusArea: review.focusArea,
    score: review.score,
    issuesCount: review.issuesCount,
    createdAt: review.createdAt,
    claims,
    suggestions,
    nextSteps,
    gaps,
  };
}

export async function setCoachNextStepCompleted(
  stepId: string,
  completed: boolean,
): Promise<CoachNextStep | null> {
  const timestamp = new Date().toISOString();
  await db
    .update(coachNextSteps)
    .set({ completed, updatedAt: timestamp })
    .where(eq(coachNextSteps.id, stepId));
  const row = await db.select().from(coachNextSteps).where(eq(coachNextSteps.id, stepId)).get();
  if (!row) return null;
  return {
    id: row.id,
    reviewId: row.reviewId,
    text: row.text,
    completed: row.completed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type { CoachAnchorType };
