import type { ChatModelSelection } from "@jobseeker/contracts";
import { CLAUDE_MODELS, CODEX_MODELS } from "@jobseeker/contracts";

import { env } from "../../env";
import { isCodexAvailable } from "../../lib/codexBin";
import { logError, logInfo, logWarn } from "../../lib/log";
import { ensureScopeDir } from "../../lib/paths";
import { pickProviderAdapter } from "../../provider/layers/providerAdapterRegistry";
import type { ProviderStreamEvent } from "../../provider/types";

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
  /**
   * Optional live observer of the turn: reasoning, tool runs, and answer
   * deltas as they stream. Uses the provider's event stream (codex) when
   * available, else falls back to answer-text deltas.
   */
  onEvent?: (event: ProviderStreamEvent) => void;
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

  // Stateless, non-streaming codex calls go straight to `codex exec`. The
  // provider adapter drives the codex app-server (a stateful, agentic thread)
  // — the right transport for chat and live streaming, but for a one-shot it
  // adds cold-start/agent-loop overhead and can hang outright in headless /
  // detached / cron contexts where the app-server doesn't complete a turn. The
  // helper discards the session id anyway, so there's nothing stateful to keep.
  // Callers that stream (onEvent) still go adapter-first below, since exec has
  // no event stream.
  if (!opts.onEvent && wantsCodex && isCodexAvailable()) {
    const direct = await callCodex(opts);
    if (direct !== null) return direct;
  }

  // Otherwise prefer the same configured provider the chat uses (codex / claude
  // / opencode adapters, picked by availability + settings) so analyses work
  // whenever chat works, and so streaming callers get their event deltas.
  const viaProvider = await callProviderAdapter(opts);
  if (viaProvider !== null) return viaProvider;

  // Direct fallbacks for when the adapter has no available provider (or the
  // streaming adapter call failed) but a raw codex binary / Anthropic key exists.
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

/**
 * Runs the prompt through the configured provider adapter (the same machinery
 * the chat uses). Returns null when no provider is available or the call fails,
 * so the caller can fall back to a direct invocation.
 */
async function callProviderAdapter(opts: OneShotPromptOptions): Promise<string | null> {
  const adapter = pickProviderAdapter(opts.modelSelection?.provider);
  if (!adapter) {
    logWarn("one-shot no provider available", {
      label: opts.label,
      requestedProvider: opts.modelSelection?.provider,
    });
    return null;
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  logInfo("one-shot start", {
    label: opts.label,
    provider: adapter.provider,
    promptChars: opts.prompt.length,
    timeoutMs,
  });
  try {
    // Run in a real working dir so codex doesn't stall on an ambiguous default.
    // codex uses its single real home (settings.codex.homePath) for auth; no
    // per-call home. A shared ephemeral scope is fine — one-shots are stateless.
    const runtime = {
      cwd: ensureScopeDir("one-shot", "coach"),
    };
    const messages = [{ role: "user", content: opts.prompt }];
    // Prefer the event stream (reasoning + tool + answer deltas) when the
    // caller wants live updates and the provider supports it (codex). Drive the
    // stream to completion, forwarding each event, then take the final text.
    const drive = async (): Promise<string> => {
      if (opts.onEvent && adapter.runEvents) {
        const turn = adapter.runEvents(
          opts.systemPrompt ?? "",
          messages,
          opts.modelSelection,
          runtime,
          controller.signal,
        );
        for await (const event of turn) opts.onEvent(event);
        return (await turn.result).text;
      }
      const turn = adapter.run(
        opts.systemPrompt ?? "",
        messages,
        opts.modelSelection,
        runtime,
        controller.signal,
      );
      if (opts.onEvent) {
        for await (const chunk of turn) opts.onEvent({ type: "message", text: chunk });
      }
      return (await turn.result).text;
    };
    // Some providers (notably the codex CLI) can ignore the abort signal and
    // hang. Race against a hard timeout so the task fails fast instead of
    // running forever.
    const text = await Promise.race([
      drive(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${opts.label} one-shot timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
    const trimmed = text.trim();
    logInfo("one-shot done", {
      label: opts.label,
      provider: adapter.provider,
      ms: Date.now() - startedAt,
      responseChars: trimmed.length,
      empty: trimmed.length === 0,
    });
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    logError(`${opts.label} via provider failed`, {
      provider: adapter.provider,
      ms: Date.now() - startedAt,
      aborted: controller.signal.aborted,
      error,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
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
      // Without the stderr tail, auth failures (refresh_token_reused etc.)
      // are indistinguishable from any other crash.
      const stderr = await new Response(proc.stderr).text().catch(() => "");
      logWarn(`${opts.label} codex exited non-zero`, {
        exitCode,
        stderr: stderr.trim().split("\n").slice(-3).join("\n").slice(0, 500),
      });
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
