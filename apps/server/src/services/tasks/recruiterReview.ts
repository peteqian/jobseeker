import type { ChatModelSelection, TailoringIssue } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { loadSkill, type SkillName } from "../skills/loadSkill";

export interface RecruiterVerdict {
  score: number;
  issues: TailoringIssue[];
}

const SEVERITIES = new Set(["high", "medium", "low"]);

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
 */
export async function reviewTailoredDoc(input: {
  docMarkdown: string;
  jobBlock: string;
  reviewSkill: SkillName;
  modelSelection?: ChatModelSelection;
}): Promise<RecruiterVerdict | null> {
  const prompt = [
    input.jobBlock,
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

  const parsed = parseJsonResponse<{ score?: unknown; issues?: unknown }>(text, "recruiter_review");
  if (!parsed || typeof parsed.score !== "number") return null;

  const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map(normalizeIssue).filter((i): i is TailoringIssue => i !== null)
    : [];
  logInfo("recruiter review done", { score, issues: issues.length });
  return { score, issues };
}
