import { formatExperiencePeriod } from "@jobseeker/contracts";
import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";

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

/** A compact, LLM-friendly view of the profile for fit scoring. */
function summarizeProfile(profile: StructuredProfile): string {
  const skills = profile.skills.map((s) => s.name).join(", ");
  const roles = profile.targeting.roles.map((r) => `${r.title} (${r.level})`).join(", ");
  return [
    profile.identity.headline ?? "",
    profile.identity.summary,
    profile.identity.yearsOfExperience
      ? `Years of experience: ${profile.identity.yearsOfExperience}`
      : "",
    skills ? `Skills: ${skills}` : "",
    roles ? `Target roles: ${roles}` : "",
    summarizeExperiences(profile.experiences),
    summarizeProjects(profile.projects ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Side projects are supplementary signal — they show skill breadth the résumé
 * may not, so include them but keep them clearly separate from paid work.
 */
function summarizeProjects(projects: NonNullable<StructuredProfile["projects"]>): string {
  if (projects.length === 0) return "";
  const lines = projects.slice(0, 6).map((project) => {
    const skills = project.skillsUsed.length ? ` — skills: ${project.skillsUsed.join(", ")}` : "";
    return `- ${project.name}: ${project.description}${skills}`;
  });
  return ["Side projects (not paid work):", ...lines].join("\n");
}

/**
 * Employment history is the strongest fit signal, so it must reach the judge.
 * Compact lines per role: title @ company (duration), top achievements, skills.
 */
function summarizeExperiences(experiences: StructuredProfile["experiences"]): string {
  if (experiences.length === 0) return "";
  const lines = experiences.slice(0, 8).map((exp) => {
    const period = formatExperiencePeriod(exp);
    const head = period
      ? `- ${exp.title} @ ${exp.company} (${period})`
      : `- ${exp.title} @ ${exp.company}`;
    const achievements = exp.achievements.slice(0, 3).map((a) => `    • ${a}`);
    const used = exp.skillsUsed.length ? `    skills: ${exp.skillsUsed.join(", ")}` : "";
    return [head, ...achievements, used].filter(Boolean).join("\n");
  });
  return ["Experience:", ...lines].join("\n");
}
