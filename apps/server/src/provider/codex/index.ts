import { codexSdkBackend } from "./sdkBackend";
import type { CodexBackend, CodexSession, CodexSessionConfig } from "./types";

let activeBackend: CodexBackend = codexSdkBackend;

export function setCodexBackend(backend: CodexBackend): void {
  activeBackend = backend;
}

export function getCodexBackend(): CodexBackend {
  return activeBackend;
}

export function createCodexSession(config: CodexSessionConfig): CodexSession {
  return activeBackend.createSession(config);
}

export { ensureCodexAuthInHome } from "./auth";
export * from "./types";
