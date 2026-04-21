import type {
  ChatMessage,
  ExplorerConfigRecord,
  QuestionAnswerMap,
  ResumePasteInput,
  ResumeUploadResult,
  ResumeVersion,
  RuntimeEvent,
  StartTaskInput,
  StructuredProfile,
  ProjectSnapshot,
  UpdateQuestionCardInput,
  UpdateExplorerConfigInput,
} from "@jobseeker/contracts";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3456";

type ProjectListResponse = { projects: ProjectSnapshot[] };
type EventListResponse = { events: RuntimeEvent[] };
type ExplorerResponse = { explorer: ExplorerConfigRecord };
type ResumeVersionsResponse = { versions: ResumeVersion[] };

export function apiUrl(path: string): string {
  return `${serverUrl}${path}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getProjects(): Promise<ProjectSnapshot[]> {
  const response = await fetch(apiUrl("/api/projects"));
  return (await parseJson<ProjectListResponse>(response)).projects;
}

export async function getProject(projectId: string): Promise<ProjectSnapshot> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}`));
  return parseJson<ProjectSnapshot>(response);
}

export async function createProject(title: string): Promise<ProjectSnapshot> {
  const response = await fetch(apiUrl("/api/projects"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });

  return parseJson<ProjectSnapshot>(response);
}

export async function uploadProjectResume(
  projectId: string,
  file: File,
): Promise<ResumeUploadResult> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(apiUrl(`/api/projects/${projectId}/resume`), {
    method: "POST",
    body: formData,
  });

  return parseJson<ResumeUploadResult>(response);
}

export async function pasteProjectResume(
  projectId: string,
  input: ResumePasteInput,
): Promise<ResumeUploadResult> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/resume/paste`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseJson<ResumeUploadResult>(response);
}

export async function startProjectTask(input: StartTaskInput) {
  const response = await fetch(apiUrl("/api/tasks"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseJson(response);
}

export async function submitQuestionAnswers(projectId: string, answers: QuestionAnswerMap) {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/questions/answers`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });

  return parseJson<ProjectSnapshot>(response);
}

export async function updateQuestionCard(input: UpdateQuestionCardInput) {
  const response = await fetch(
    apiUrl(`/api/projects/${input.projectId}/question-cards/${input.cardId}`),
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: input.answer }),
    },
  );

  return parseJson<ProjectSnapshot>(response);
}

export async function saveProjectProfile(
  projectId: string,
  profile: StructuredProfile,
): Promise<ProjectSnapshot> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/profile`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  });

  return parseJson<ProjectSnapshot>(response);
}

export async function getResumeVersions(projectId: string): Promise<ResumeVersion[]> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/resume/versions`));
  return (await parseJson<ResumeVersionsResponse>(response)).versions;
}

export async function switchActiveResume(
  projectId: string,
  documentId: string,
): Promise<ProjectSnapshot> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/resume/activate`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId }),
  });

  return parseJson<ProjectSnapshot>(response);
}

export async function deleteProjectResume(
  projectId: string,
  documentId: string,
): Promise<ProjectSnapshot> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/resume/${documentId}`), {
    method: "DELETE",
  });

  return parseJson<ProjectSnapshot>(response);
}

export async function getProjectEvents(projectId: string): Promise<RuntimeEvent[]> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/events`));
  return (await parseJson<EventListResponse>(response)).events;
}

export async function getAllEvents(): Promise<RuntimeEvent[]> {
  const response = await fetch(apiUrl("/api/events"));
  return (await parseJson<EventListResponse>(response)).events;
}

export type ConnectionStatus = {
  name: string;
  id: string;
  ok: boolean;
  message: string;
};

export type ProviderSettings = {
  codex: {
    enabled: boolean;
    binaryPath: string;
    homePath: string;
  };
  claude: {
    enabled: boolean;
    binaryPath: string;
  };
  opencode: {
    enabled: boolean;
    binaryPath: string;
    serverUrl: string;
    serverPassword: string;
    customModels: string[];
  };
};

type ConnectionsResponse = { connections: ConnectionStatus[] };

export async function getConnections(): Promise<ConnectionStatus[]> {
  const response = await fetch(apiUrl("/api/settings/connections"));
  return (await parseJson<ConnectionsResponse>(response)).connections;
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  const response = await fetch(apiUrl("/api/settings/providers"));
  return (await parseJson<{ providers: ProviderSettings }>(response)).providers;
}

export async function updateProviderSettings(
  settings: Partial<ProviderSettings>,
): Promise<ProviderSettings> {
  const response = await fetch(apiUrl("/api/settings/providers"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  return (await parseJson<{ providers: ProviderSettings }>(response)).providers;
}

export async function updateProjectExplorer(
  projectId: string,
  input: UpdateExplorerConfigInput,
): Promise<ExplorerConfigRecord> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/explorer`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return (await parseJson<ExplorerResponse>(response)).explorer;
}

export type ChatProviderStatus = { id: string; available: boolean };

export async function getChatProviders(): Promise<ChatProviderStatus[]> {
  const response = await fetch(apiUrl("/api/chat/providers"));
  return (await parseJson<{ providers: ChatProviderStatus[] }>(response)).providers;
}

export async function getChatMessages(projectId: string): Promise<ChatMessage[]> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/chat/messages`));
  return parseJson<ChatMessage[]>(response);
}

export async function sendChatMessage(
  projectId: string,
  content: string,
  provider?: string,
): Promise<Response> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/chat`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, provider }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Chat request failed with ${response.status}`);
  }

  return response;
}

export async function dismissInsightCard(projectId: string, cardId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/insight-cards/${cardId}`), {
    method: "DELETE",
  });

  await parseJson(response);
}
