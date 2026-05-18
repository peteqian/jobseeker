import type { ChatModelSelection } from "@jobseeker/contracts";

import { logInfo } from "../../lib/log";
import { parseJsonResponse, runOneShotPrompt } from "../llm/oneShotPrompt";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { ATS_ANALYSIS_SYSTEM_PROMPT, buildAtsAnalysisUserMessage } from "./prompts";

export interface AtsIssue {
  severity: "high" | "med" | "low";
  category: "formatting" | "keywords" | "structure" | "missing_section";
  description: string;
  fix: string;
}

export interface AtsAnalysisResult {
  score: number;
  issues: AtsIssue[];
  recommendations: string[];
  keywordGaps: string[];
}

export interface RunAtsAnalysisOptions {
  projectId: string;
  modelSelection?: ChatModelSelection;
}

const VALID_SEVERITIES: ReadonlySet<string> = new Set(["high", "med", "low"]);
const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "formatting",
  "keywords",
  "structure",
  "missing_section",
]);

export async function runAtsAnalysis(
  options: RunAtsAnalysisOptions,
): Promise<AtsAnalysisResult | null> {
  const resumeText = await getProjectResumeText(options.projectId);
  if (!resumeText) {
    logInfo("ats_analysis skipped", { projectId: options.projectId, reason: "no_resume" });
    return null;
  }

  const profile = await readProjectProfile(options.projectId);
  const targetRoles = profile?.targeting.roles.map((r) => r.title) ?? [];

  const text = await runOneShotPrompt({
    label: "ats_analysis",
    systemPrompt: ATS_ANALYSIS_SYSTEM_PROMPT,
    prompt: buildAtsAnalysisUserMessage(resumeText, targetRoles),
    modelSelection: options.modelSelection,
  });
  if (!text) return null;

  const raw = parseJsonResponse<Record<string, unknown>>(text, "ats_analysis");
  if (!raw) return null;

  return {
    score: typeof raw.score === "number" ? raw.score : 0,
    issues: parseIssues(raw.issues),
    recommendations: stringArray(raw.recommendations),
    keywordGaps: stringArray(raw.keywordGaps),
  };
}

function parseIssues(value: unknown): AtsIssue[] {
  if (!Array.isArray(value)) return [];
  const issues: AtsIssue[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    issues.push({
      severity: VALID_SEVERITIES.has(String(i.severity))
        ? (i.severity as AtsIssue["severity"])
        : "low",
      category: VALID_CATEGORIES.has(String(i.category))
        ? (i.category as AtsIssue["category"])
        : "structure",
      description: String(i.description ?? ""),
      fix: String(i.fix ?? ""),
    });
  }
  return issues;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
