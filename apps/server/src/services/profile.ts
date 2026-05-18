import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";

import { logInfo, logWarn } from "../lib/log";
import { PROFILE_SYSTEM_PROMPT } from "../prompts/profile";
import { parseJsonResponse, runOneShotPrompt } from "./llm/oneShotPrompt";

export interface AnswerRow {
  fieldLabel: string;
  answerJson: string;
}

/**
 * Builds a structured profile from resume text and question-answer history.
 *
 * Tries codex (local, free) first, then Claude as fallback. Returns the
 * existing profile (or an empty one) when no provider yields a usable result.
 */
export async function buildProfileFromResume(
  resumeText: string,
  questionHistory: AnswerRow[],
  existingProfile: StructuredProfile | null,
  modelSelection?: ChatModelSelection,
): Promise<StructuredProfile> {
  const userContent = buildUserMessage(
    resumeText,
    formatQuestionHistory(questionHistory),
    existingProfile,
  );

  logInfo("profile build start", { provider: modelSelection?.provider ?? "auto" });

  const text = await runOneShotPrompt({
    label: "profile_build",
    systemPrompt: PROFILE_SYSTEM_PROMPT,
    prompt: userContent,
    modelSelection,
  });
  if (!text) {
    logWarn("profile build returned no result");
    return existingProfile ?? emptyProfile();
  }

  const parsed = parseJsonResponse<StructuredProfile>(text, "profile_build");
  if (!parsed) return existingProfile ?? emptyProfile();

  return finalizeProfile(parsed, existingProfile);
}

function finalizeProfile(
  profile: StructuredProfile,
  existingProfile: StructuredProfile | null,
): StructuredProfile {
  profile.version = existingProfile ? existingProfile.version + 1 : 1;
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function buildUserMessage(
  resumeText: string,
  qaBlock: string,
  existingProfile: StructuredProfile | null,
): string {
  const parts = [`<resume>\n${resumeText}\n</resume>`];
  if (qaBlock) parts.push(`<question-answers>\n${qaBlock}\n</question-answers>`);
  if (existingProfile) {
    parts.push(
      `<existing-profile>\nMerge and improve on this existing profile where the resume or answers provide better data:\n${JSON.stringify(existingProfile, null, 2)}\n</existing-profile>`,
    );
  }
  parts.push("Extract the structured profile JSON from the above.");
  return parts.join("\n\n");
}

function formatQuestionHistory(history: AnswerRow[]): string {
  if (history.length === 0) return "";
  return history.map((record) => `Q: ${record.fieldLabel}\nA: ${record.answerJson}`).join("\n\n");
}

function emptyProfile(): StructuredProfile {
  const timestamp = new Date().toISOString();
  return {
    version: 1,
    updatedAt: timestamp,
    identity: { summary: "" },
    experiences: [],
    skills: [],
    targeting: {
      roles: [],
      locations: [],
      companyPreference: { industries: [], avoidIndustries: [] },
    },
    searchContext: { effectiveKeywords: [], ineffectiveKeywords: [], discoveredPatterns: [] },
    memory: { clarifications: [], discoveredPreferences: [] },
  };
}
