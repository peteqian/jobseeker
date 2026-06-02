import type { ChatModelSelection, MatchLevel, StructuredProfile } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { summarizeProfile } from "../profile/summarize";

export interface MatchAssessment {
  level: MatchLevel;
  /** 0-100, secondary sort within a level. */
  score: number;
  reasons: string[];
  gaps: string[];
}

/**
 * The heart of explorer matching. The model reads the FULL job description and
 * judges it against the candidate's whole profile — work experience, technical
 * skills, projects, and education — then returns a categorical level.
 *
 * The hard part is that job ads are written by HR/recruiters who routinely
 * inflate requirements (a junior-doable role asking for "5+ years", long
 * keyword laundry lists). The prompt tells the model to treat those as soft
 * signals, not gates, and to judge whether the candidate could actually do the
 * work from demonstrated ability.
 */
const MATCH_SYSTEM_PROMPT = `You judge how well a candidate fits a job by reading the full job description against the candidate's whole profile (work experience, technical skills, projects, education).

Output ONLY one JSON object:
{"level": "exact" | "partial" | "no_match", "score": <0-100 integer>, "reasons": ["short reason", ...], "gaps": ["short gap", ...]}

Level meaning:
- "exact": the candidate can clearly do this role. Their experience, skills, and projects cover the real work.
- "partial": capable with a stretch — most of the work is within reach, with a couple of genuine gaps.
- "no_match": wrong domain or wrong seniority by a wide margin — they could not realistically do or get this role.

CRITICAL — job ads are written by recruiters and HR, not engineers, and they routinely inflate requirements:
- Treat "N+ years of experience" as a soft preference, NOT a hard gate. A capable junior often fits a role advertised as "5+ years".
- Treat long lists of "required" tools/keywords as a wishlist. Missing a few is normal and does not lower the level on its own.
- Ignore boilerplate (culture buzzwords, generic responsibilities).
- Judge on whether the candidate's DEMONSTRATED skills, projects, and experience show they could do the actual work — not on whether they tick every stated year or keyword.
- Do not penalise for seniority unless the role is genuinely senior in substance (real leadership/architecture ownership), not just titled "Senior".

Keep reasons and gaps short and concrete. Output ONLY the JSON.`;

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeLevel(value: unknown): MatchLevel | null {
  if (value === "exact" || value === "partial" || value === "no_match") return value;
  return null;
}

/**
 * Scores one job against the profile. Returns null when no provider is available
 * or the response is unparseable / lacks a usable level, so the caller decides
 * how to handle an indeterminate result.
 */
export async function assessMatch(input: {
  job: { title: string; company: string; location: string };
  descriptionText: string;
  profile: StructuredProfile;
  modelSelection?: ChatModelSelection;
}): Promise<MatchAssessment | null> {
  const prompt = [
    "<candidate>",
    summarizeProfile(input.profile),
    "</candidate>",
    "",
    "<job>",
    `Title: ${input.job.title}`,
    `Company: ${input.job.company}`,
    `Location: ${input.job.location}`,
    "",
    input.descriptionText.slice(0, 12_000),
    "</job>",
    "",
    "Judge the match as JSON.",
  ].join("\n");

  const text = await runOneShotPrompt({
    label: "explorer_match",
    systemPrompt: MATCH_SYSTEM_PROMPT,
    prompt,
    modelSelection: input.modelSelection,
  });
  if (!text) return null;

  const parsed = parseJsonResponse<Partial<MatchAssessment>>(text, "explorer_match");
  if (!parsed) return null;
  const level = normalizeLevel(parsed.level);
  if (!level) return null;

  const assessment: MatchAssessment = {
    level,
    score: clampScore(parsed.score),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 5) : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5) : [],
  };
  logInfo("explorer match assessed", { level: assessment.level, score: assessment.score });
  return assessment;
}
