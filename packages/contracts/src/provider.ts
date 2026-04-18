export interface ProviderSession {
  projectId: string;
  provider: "codex";
  status: "connecting" | "ready" | "running" | "closed" | "error";
  createdAt: string;
  updatedAt: string;
  resumeCursor?: { projectId: string };
  lastError?: string;
}

export interface ProviderTurnStartResult {
  projectId: string;
  turnId: string;
}

export interface ProviderRuntimeEvent {
  id: string;
  projectId: string;
  createdAt: string;
  provider: "codex";
  kind: "session" | "notification" | "error";
  method: string;
  message?: string;
  payload?: unknown;
}
