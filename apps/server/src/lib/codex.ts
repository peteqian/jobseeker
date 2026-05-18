import type { z } from "zod";

import { createCodexSession } from "../provider/codex";
import type { CodexSession } from "../provider/codex";

export { ensureCodexAuthInHome } from "../provider/codex";

export interface CodexThreadHandle {
  readonly session: CodexSession;
  runTurn<T>(input: {
    prompt: string;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<{ parsed: T; finalResponse: string }>;
}

export function createCodexThread(input: {
  readonly binaryPath: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly cwd?: string;
  readonly codexHome?: string;
}): CodexThreadHandle {
  const session = createCodexSession({
    binaryPath: input.binaryPath,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    cwd: input.cwd,
    codexHome: input.codexHome,
  });
  return {
    session,
    runTurn: (turn) => session.runTurn(turn),
  };
}

export function runCodexPrompt(input: {
  readonly binaryPath: string;
  readonly prompt: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly cwd?: string;
  readonly codexHome?: string;
  readonly signal?: AbortSignal;
}): AsyncIterable<string> & { result: Promise<{ text: string }> } {
  const session = createCodexSession({
    binaryPath: input.binaryPath,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    cwd: input.cwd,
    codexHome: input.codexHome,
  });
  return session.runPrompt(input.prompt, { signal: input.signal });
}
