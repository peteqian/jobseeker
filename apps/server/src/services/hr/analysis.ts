import type { ChatModelSelection } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { HR_ANALYSIS_SYSTEM_PROMPT, buildHrAnalysisUserMessage } from "./prompts";

export interface HrDiscussionSeed {
  topic: string;
  question: string;
}

export interface HrAnalysisResult {
  score: number;
  strengths: string[];
  concerns: string[];
  discussionSeeds: HrDiscussionSeed[];
  narrative: string;
}

export interface RunHrAnalysisOptions {
  projectId: string;
  modelSelection?: ChatModelSelection;
}

export async function runHrAnalysis(
  options: RunHrAnalysisOptions,
): Promise<HrAnalysisResult | null> {
  const resumeText = await getProjectResumeText(options.projectId);
  if (!resumeText) {
    logInfo("hr_analysis skipped", { projectId: options.projectId, reason: "no_resume" });
    return null;
  }

  const profile = await readProjectProfile(options.projectId);
  const targetRoles = profile?.targeting.roles.map((r) => r.title) ?? [];

  const text = await runOneShotPrompt({
    label: "hr_analysis",
    systemPrompt: HR_ANALYSIS_SYSTEM_PROMPT,
    prompt: buildHrAnalysisUserMessage(resumeText, targetRoles),
    modelSelection: options.modelSelection,
  });
  if (!text) return null;

  const raw = parseJsonResponse<Record<string, unknown>>(text, "hr_analysis");
  if (!raw) return null;

  return {
    score: typeof raw.score === "number" ? raw.score : 0,
    strengths: stringArray(raw.strengths),
    concerns: stringArray(raw.concerns),
    discussionSeeds: parseDiscussionSeeds(raw.discussionSeeds),
    narrative: String(raw.narrative ?? ""),
  };
}

function parseDiscussionSeeds(value: unknown): HrDiscussionSeed[] {
  if (!Array.isArray(value)) return [];
  const seeds: HrDiscussionSeed[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    seeds.push({ topic: String(i.topic ?? ""), question: String(i.question ?? "") });
  }
  return seeds;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
