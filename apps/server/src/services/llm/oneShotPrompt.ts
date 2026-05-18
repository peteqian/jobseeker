import type { ChatModelSelection } from "@jobseeker/contracts";
import { CLAUDE_MODELS, CODEX_MODELS } from "@jobseeker/contracts";

import { env } from "../../env";
import { logError, logWarn } from "../../lib/log";

const CLAUDE_API_MODEL_MAP: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6": "claude-sonnet-4-6-20250514",
};

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_MAX_TOKENS = 4096;

export interface OneShotPromptOptions {
  /** User prompt (already includes any system/context blocks if no `systemPrompt` is passed). */
  prompt: string;
  /** Optional system prompt. When passed, sent as system field for Claude and prepended for Codex. */
  systemPrompt?: string;
  /** Caller-controlled model/effort/provider. If unset: codex (default model) then claude fallback. */
  modelSelection?: ChatModelSelection;
  /** Per-call timeout. Default 2 minutes. */
  timeoutMs?: number;
  /** Claude max_tokens. Default 4096. */
  maxTokens?: number;
  /** Short identifier used in error logs (e.g. "ats_analysis"). */
  label: string;
}

/**
 * One-shot LLM call with codex (local binary) tried first, then Claude API.
 *
 * Returns the raw response text on success, or `null` if both providers are
 * unavailable or fail. The helper consolidates the codex spawn pattern and the
 * Claude SDK call that were previously duplicated across coach/ats/hr/profile/
 * tailoring.
 */
export async function runOneShotPrompt(opts: OneShotPromptOptions): Promise<string | null> {
  const wantsCodex = !opts.modelSelection?.provider || opts.modelSelection.provider === "codex";
  const wantsClaude = !opts.modelSelection?.provider || opts.modelSelection.provider === "claude";

  if (wantsCodex && isCodexAvailable()) {
    const result = await callCodex(opts);
    if (result !== null) return result;
  }

  if (wantsClaude && env.ANTHROPIC_API_KEY) {
    const result = await callClaude(opts);
    if (result !== null) return result;
  }

  return null;
}

/** Strips ```...``` fences (with optional language tag) from start/end of a response. */
export function stripFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|markdown|md)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}

/** Parse a JSON object out of a model response, tolerating code fences. Returns `null` on failure. */
export function parseJsonResponse<T = unknown>(text: string, label: string): T | null {
  try {
    return JSON.parse(stripFences(text)) as T;
  } catch (error) {
    logError(`${label} JSON parse failed`, { error });
    return null;
  }
}

export function isCodexAvailable(): boolean {
  const binPath = process.env.CODEX_BIN ?? "codex";
  try {
    const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function callCodex(opts: OneShotPromptOptions): Promise<string | null> {
  const binPath = process.env.CODEX_BIN ?? "codex";
  const fullPrompt = opts.systemPrompt ? `${opts.systemPrompt}\n\n${opts.prompt}` : opts.prompt;

  const args = [binPath, "exec", "--ephemeral", "-s", "read-only"];
  const codexModel = resolveCodexModel(opts.modelSelection);
  if (codexModel) {
    args.push("--model", codexModel.model);
    if (codexModel.effort) {
      args.push("--config", `model_reasoning_effort="${codexModel.effort}"`);
    }
  }
  args.push("-");

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const proc = Bun.spawn(args, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(new TextEncoder().encode(fullPrompt));
    proc.stdin.end();

    const stdoutPromise = new Response(proc.stdout).text();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`${opts.label} codex timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const stdout = await Promise.race([stdoutPromise, timeoutPromise]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      logWarn(`${opts.label} codex exited non-zero`, { exitCode });
      return null;
    }
    const text = stdout.trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    logError(`${opts.label} via codex failed`, { error });
    return null;
  }
}

async function callClaude(opts: OneShotPromptOptions): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const apiModel = resolveClaudeApiModel(opts.modelSelection);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: apiModel,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : null;
  } catch (error) {
    logError(`${opts.label} via Claude failed`, { error });
    return null;
  }
}

function resolveCodexModel(
  selection: ChatModelSelection | undefined,
): { model: string; effort?: string } | null {
  if (selection?.provider && selection.provider !== "codex") return null;
  if (!selection?.model) {
    const def = CODEX_MODELS[0];
    return { model: def.slug, effort: def.capabilities.defaultEffort };
  }
  const modelDef = CODEX_MODELS.find((m) => m.slug === selection.model) ?? CODEX_MODELS[0];
  return {
    model: selection.model,
    effort: selection.effort ?? modelDef.capabilities.defaultEffort,
  };
}

function resolveClaudeApiModel(selection: ChatModelSelection | undefined): string {
  const slug =
    selection?.provider === "claude" && selection.model ? selection.model : CLAUDE_MODELS[0].slug;
  return CLAUDE_API_MODEL_MAP[slug] ?? slug;
}
