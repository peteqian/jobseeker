import { desc, eq } from "drizzle-orm";
import type {
  ChatModelSelection,
  CoachClaim,
  CoachClaimStatus,
  CoachNextStep,
  CoachReview,
  CoachSuggestion,
} from "@jobseeker/contracts";

import { db } from "../../db";
import { coachClaims, coachNextSteps, coachReviews, coachSuggestions } from "../../db/schema";
import { env } from "../../env";
import { makeId } from "../../lib/ids";
import { buildCoachReviewUserMessage, COACH_REVIEW_SYSTEM_PROMPT } from "../../prompts/coach";
import { getProjectResumeText } from "../projects/resume";

interface RawClaim {
  text: string;
  status: CoachClaimStatus;
  statusReason: string;
  suggestions?: string[];
}

interface RawReview {
  focusArea: string;
  score: number;
  claims: RawClaim[];
  nextSteps: string[];
}

export async function runCoachReview(
  projectId: string,
  resumeDocId: string,
  focusArea: string,
  _modelSelection?: ChatModelSelection,
): Promise<CoachReview | null> {
  const resumeText = await getProjectResumeText(projectId);
  if (!resumeText) return null;

  const raw = await callCoachModel(resumeText, focusArea);
  if (!raw) return null;

  return persistReview(projectId, resumeDocId, raw);
}

async function callCoachModel(resumeText: string, focusArea: string): Promise<RawReview | null> {
  const prompt = `${COACH_REVIEW_SYSTEM_PROMPT}\n\n${buildCoachReviewUserMessage(
    resumeText,
    focusArea,
  )}`;

  const codexResult = await tryCodex(prompt);
  if (codexResult) return codexResult;

  const claudeResult = await tryClaude(prompt);
  if (claudeResult) return claudeResult;

  return null;
}

async function tryCodex(prompt: string): Promise<RawReview | null> {
  const binPath = process.env.CODEX_BIN ?? "codex";

  try {
    const versionProc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
    if (versionProc.exitCode !== 0) return null;
  } catch {
    return null;
  }

  try {
    const args = [binPath, "exec", "--ephemeral", "-s", "read-only", "-"];
    const proc = Bun.spawn(args, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });

    proc.stdin.write(new TextEncoder().encode(prompt));
    proc.stdin.end();

    const timeoutMs = 2 * 60 * 1000;
    const stdoutPromise = new Response(proc.stdout).text();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Coach review codex timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const stdout = await Promise.race([stdoutPromise, timeoutPromise]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;

    return parseReview(stdout);
  } catch (error) {
    console.error("Coach review via codex failed:", error);
    return null;
  }
}

async function tryClaude(prompt: string): Promise<RawReview | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return parseReview(text);
  } catch (error) {
    console.error("Coach review via Claude failed:", error);
    return null;
  }
}

function parseReview(text: string): RawReview | null {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  try {
    return JSON.parse(cleaned) as RawReview;
  } catch (error) {
    console.error("Coach review JSON parse failed:", error);
    return null;
  }
}

async function persistReview(
  projectId: string,
  resumeDocId: string,
  raw: RawReview,
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
