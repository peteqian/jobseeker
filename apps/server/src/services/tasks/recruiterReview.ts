import type { ChatModelSelection, TailoringIssue, TailoringShortlist } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { loadSkill, type SkillName } from "../skills/loadSkill";

/**
 * Two-judgment recruiter verdict, mirroring a real screen:
 * - `presentationScore` — how well the document sells the candidate's true
 *   background. Fixable by editing; the revise loop targets this.
 * - `fitScore` — how well the background matches the role. Not editable;
 *   surfaced with `gaps` so the user can judge the job, not the document.
 * - `shortlist` — the recruiter's advance/pass call.
 */
export interface RecruiterVerdict {
  presentationScore: number;
  fitScore: number;
  shortlist: TailoringShortlist;
  gaps: string[];
  issues: TailoringIssue[];
}

const SEVERITIES = new Set(["high", "medium", "low"]);
const SHORTLISTS = new Set<TailoringShortlist>(["strong_yes", "yes", "maybe", "no"]);

function normalizeIssue(raw: unknown): TailoringIssue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const issue = typeof r.issue === "string" ? r.issue.trim() : "";
  if (!issue) return null;
  const severity = SEVERITIES.has(r.severity as string)
    ? (r.severity as TailoringIssue["severity"])
    : "medium";
  return { severity, issue, fix: typeof r.fix === "string" ? r.fix : "" };
}

/**
 * Runs a review skill over a tailored document (resume or cover letter) and
 * returns a score + ranked issues. Returns null when no provider is available or
 * the response is unparseable, so the caller can proceed without a verdict.
 *
 * `candidateBlocks` (profile + source resume) lets the reviewer tell fixable
 * gaps (candidate has the skill, draft omits it) from unfixable ones (candidate
 * lacks it) — without it, issues degrade into unactionable "if genuine, add X".
 */
export async function reviewTailoredDoc(input: {
  docMarkdown: string;
  jobBlock: string;
  candidateBlocks?: string;
  reviewSkill: SkillName;
  modelSelection?: ChatModelSelection;
}): Promise<RecruiterVerdict | null> {
  const prompt = [
    input.jobBlock,
    ...(input.candidateBlocks ? ["", input.candidateBlocks] : []),
    "",
    "<draft>",
    input.docMarkdown,
    "</draft>",
    "",
    "Review the draft against the job. Output the JSON verdict.",
  ].join("\n");

  const text = await runOneShotPrompt({
    label: "recruiter_review",
    systemPrompt: loadSkill(input.reviewSkill),
    prompt,
    modelSelection: input.modelSelection,
  });
  if (!text) return null;

  const parsed = parseJsonResponse<{
    presentationScore?: unknown;
    fitScore?: unknown;
    shortlist?: unknown;
    gaps?: unknown;
    score?: unknown;
    issues?: unknown;
  }>(text, "recruiter_review");
  if (!parsed) return null;

  // Skill files are user-editable: an older or hand-rolled skill may still
  // emit the legacy single `score`. Treat it as both judgments so the loop
  // keeps working rather than failing the review.
  const presentationRaw =
    typeof parsed.presentationScore === "number" ? parsed.presentationScore : parsed.score;
  if (typeof presentationRaw !== "number") return null;
  const presentationScore = clampScore(presentationRaw);
  const fitScore = clampScore(
    typeof parsed.fitScore === "number" ? parsed.fitScore : presentationRaw,
  );

  const shortlist = SHORTLISTS.has(parsed.shortlist as TailoringShortlist)
    ? (parsed.shortlist as TailoringShortlist)
    : inferShortlist(fitScore);
  const gaps = Array.isArray(parsed.gaps)
    ? parsed.gaps.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
    : [];
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map(normalizeIssue).filter((i): i is TailoringIssue => i !== null)
    : [];
  logInfo("recruiter review done", {
    presentationScore,
    fitScore,
    shortlist,
    gaps: gaps.length,
    issues: issues.length,
  });
  return { presentationScore, fitScore, shortlist, gaps, issues };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Fallback shortlist when a legacy skill omits it: map fit to the call a recruiter would make. */
function inferShortlist(fitScore: number): TailoringShortlist {
  if (fitScore >= 85) return "strong_yes";
  if (fitScore >= 70) return "yes";
  if (fitScore >= 50) return "maybe";
  return "no";
}
