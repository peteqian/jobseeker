import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { summarizeProfile } from "../profile/summarize";

export interface FitAssessment {
  /** 0-100 fit of the candidate to the role. */
  score: number;
  reasons: string[];
}

const FIT_SYSTEM_PROMPT = `You score how well a candidate fits a job. Given the candidate profile and the job posting text, output a single JSON object: {"score": <0-100 integer>, "reasons": ["short reason", ...]}. Score on skills, seniority, and domain match. Be honest — a poor match must score low. Output ONLY the JSON.`;

/** The minimum fit score (0-100) at or above which we proceed to apply. */
export function applyMinScore(): number {
  const raw = Number.parseInt(process.env.APPLY_MIN_SCORE ?? "70", 10);
  return Number.isFinite(raw) ? raw : 70;
}

/**
 * Scores the fit of a profile against a job posting's visible text. Returns
 * null when no LLM provider is available or the response is unparseable, so the
 * caller can decide how to handle an indeterminate result.
 */
export async function assessFit(input: {
  roleText: string;
  profile: StructuredProfile;
  modelSelection?: ChatModelSelection;
}): Promise<FitAssessment | null> {
  const prompt = [
    "<candidate>",
    summarizeProfile(input.profile),
    "</candidate>",
    "",
    "<job-posting>",
    input.roleText.slice(0, 12_000),
    "</job-posting>",
    "",
    "Score the fit as JSON.",
  ].join("\n");

  const text = await runOneShotPrompt({
    label: "apply_fit",
    systemPrompt: FIT_SYSTEM_PROMPT,
    prompt,
    modelSelection: input.modelSelection,
  });
  if (!text) return null;

  const parsed = parseJsonResponse<FitAssessment>(text, "apply_fit");
  if (!parsed || typeof parsed.score !== "number") return null;

  const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
  logInfo("apply fit assessed", { score });
  return { score, reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [] };
}
