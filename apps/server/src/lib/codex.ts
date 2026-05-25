import { createCodexSession } from "../provider/codex";

export { ensureCodexAuthInHome } from "../provider/codex";

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
