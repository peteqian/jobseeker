import type { ChatModelSelection, StructuredProfile } from "@jobseeker/contracts";
import { CODEX_MODELS, CLAUDE_MODELS } from "@jobseeker/contracts";
import { env } from "../env";
import { PROFILE_SYSTEM_PROMPT } from "../prompts/profile";

export interface AnswerRow {
  fieldLabel: string;
  answerJson: string;
}

/**
 * Builds a structured profile from resume text and question-answer history.
 *
 * Tries codex (local, free) first, then Claude as fallback.
 * Returns an empty profile if neither provider is available.
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

  const codexAvailable = isCodexAvailable();
  const claudeAvailable = Boolean(env.ANTHROPIC_API_KEY);

  const tryCodexFirst = !modelSelection?.provider || modelSelection.provider === "codex";
  const tryClaudeFallback = !modelSelection?.provider || modelSelection.provider === "claude";

  if (tryCodexFirst && codexAvailable) {
    const model = modelSelection?.model ?? CODEX_MODELS[0].slug;
    const modelDef = CODEX_MODELS.find((m) => m.slug === model) ?? CODEX_MODELS[0];
    const effort = modelSelection?.effort ?? modelDef.capabilities.defaultEffort;

    console.info(`Profile build: starting codex (model: ${model}, effort: ${effort})`);
    const codexResult = await tryCodex(userContent, model, effort);
    if (codexResult) {
      console.info(`Profile build: completed via codex (model: ${model}, effort: ${effort})`);
      return finalizeProfile(codexResult, existingProfile);
    }
    console.warn("Profile build: codex available but returned no result");
  }

  if (tryClaudeFallback && claudeAvailable) {
    const model =
      modelSelection?.provider === "claude" && modelSelection.model
        ? modelSelection.model
        : CLAUDE_MODELS[0].slug;
    console.info(`Profile build: starting Claude (model: ${model})`);
    const claudeResult = await tryClaude(userContent, model);
    if (claudeResult) {
      console.info(`Profile build: completed via Claude (model: ${model})`);
      return finalizeProfile(claudeResult, existingProfile);
    }
    console.warn("Profile build: Claude API available but returned no result");
  }

  if (!codexAvailable && !claudeAvailable) {
    console.warn(
      "Profile build: no provider available (codex binary not found, no ANTHROPIC_API_KEY)",
    );
  }
  return existingProfile ?? emptyProfile();
}

// ---------------------------------------------------------------------------
// Codex provider (local binary)
// ---------------------------------------------------------------------------

function isCodexAvailable(): boolean {
  const binPath = process.env.CODEX_BIN ?? "codex";
  try {
    const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function tryCodex(
  userContent: string,
  model: string,
  effort?: string,
): Promise<StructuredProfile | null> {
  const binPath = process.env.CODEX_BIN ?? "codex";
  const prompt = `${PROFILE_SYSTEM_PROMPT}\n\n${userContent}`;
  const args = [binPath, "exec", "--ephemeral", "-s", "read-only", "--model", model];
  if (effort) {
    args.push("--config", `model_reasoning_effort="${effort}"`);
  }
  args.push("-");

  try {
    const timeoutMs = 2 * 60 * 1000;
    const proc = Bun.spawn(args, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });

    proc.stdin.write(new TextEncoder().encode(prompt));
    proc.stdin.end();

    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Codex profile build timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const stdout = await Promise.race([stdoutPromise, timeoutPromise]);
      const exitCode = await proc.exited;
      const stderr = await stderrPromise;

      if (exitCode !== 0) {
        console.error(`Profile build: codex exited with code ${exitCode}`, stderr);
        return null;
      }

      const raw = cleanJsonResponse(stdout);
      if (!raw) {
        console.warn("Profile build: codex returned empty output");
        return null;
      }

      return JSON.parse(raw) as StructuredProfile;
    } catch (error) {
      console.error("Profile build via codex failed:", error);
      return null;
    }
  } catch (error) {
    console.error("Profile build via codex failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claude provider (API fallback)
// ---------------------------------------------------------------------------

async function tryClaude(userContent: string, model: string): Promise<StructuredProfile | null> {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  const MODEL_MAP: Record<string, string> = {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6": "claude-sonnet-4-6-20250514",
  };
  const apiModel = MODEL_MAP[model] ?? model;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: apiModel,
      max_tokens: 4096,
      system: PROFILE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return JSON.parse(cleanJsonResponse(text)) as StructuredProfile;
  } catch (error) {
    console.error("Profile build via Claude failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const parts: string[] = [];

  parts.push(`<resume>\n${resumeText}\n</resume>`);

  if (qaBlock) {
    parts.push(`<question-answers>\n${qaBlock}\n</question-answers>`);
  }

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

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  return cleaned.trim();
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
