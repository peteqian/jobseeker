import type {
  ChatMessage,
  ExplorerConfigRecord,
  ProjectDocument,
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

async function get<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  return parseJson<T>(response);
}

async function post<T>(
  path: string,
  body?: unknown,
  options?: { formData?: FormData },
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: options?.formData ? undefined : { "content-type": "application/json" },
    body: options?.formData ?? (body ? JSON.stringify(body) : undefined),
  });
  return parseJson<T>(response);
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<T>(response);
}

async function del<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { method: "DELETE" });
  return parseJson<T>(response);
}

export async function getProjects(): Promise<ProjectSnapshot[]> {
  return (await get<ProjectListResponse>("/api/projects")).projects;
}

export async function getProject(projectId: string): Promise<ProjectSnapshot> {
  return get<ProjectSnapshot>(`/api/projects/${projectId}`);
}

export async function createProject(title: string): Promise<ProjectSnapshot> {
  return post<ProjectSnapshot>("/api/projects", { title });
}

export async function uploadProjectResume(
  projectId: string,
  file: File,
): Promise<ResumeUploadResult> {
  const formData = new FormData();
  formData.set("file", file);
  return post<ResumeUploadResult>(`/api/projects/${projectId}/resume`, undefined, { formData });
}

export async function pasteProjectResume(
  projectId: string,
  input: ResumePasteInput,
): Promise<ResumeUploadResult> {
  return post<ResumeUploadResult>(`/api/projects/${projectId}/resume/paste`, input);
}

export async function startProjectTask(input: StartTaskInput) {
  return post("/api/tasks", input);
}

export async function submitQuestionAnswers(projectId: string, answers: QuestionAnswerMap) {
  return post<ProjectSnapshot>(`/api/projects/${projectId}/questions/answers`, { answers });
}

export async function updateQuestionCard(input: UpdateQuestionCardInput) {
  return put<ProjectSnapshot>(`/api/projects/${input.projectId}/question-cards/${input.cardId}`, {
    answer: input.answer,
  });
}

export async function saveProjectProfile(
  projectId: string,
  profile: StructuredProfile,
): Promise<ProjectSnapshot> {
  return put<ProjectSnapshot>(`/api/projects/${projectId}/profile`, profile);
}

export async function getResumeVersions(projectId: string): Promise<ResumeVersion[]> {
  return (await get<ResumeVersionsResponse>(`/api/projects/${projectId}/resume/versions`)).versions;
}

export async function switchActiveResume(
  projectId: string,
  documentId: string,
): Promise<ProjectSnapshot> {
  return post<ProjectSnapshot>(`/api/projects/${projectId}/resume/activate`, { documentId });
}

export async function deleteProjectResume(
  projectId: string,
  documentId: string,
): Promise<ProjectSnapshot> {
  return del<ProjectSnapshot>(`/api/projects/${projectId}/resume/${documentId}`);
}

export async function deleteProjectJob(projectId: string, jobId: string): Promise<ProjectSnapshot> {
  return del<ProjectSnapshot>(`/api/projects/${projectId}/jobs/${jobId}`);
}

export async function updateDocument(
  projectId: string,
  documentId: string,
  input: { content: string },
): Promise<ProjectDocument> {
  const response = await put<{ document: ProjectDocument }>(
    `/api/projects/${projectId}/documents/${documentId}`,
    input,
  );
  return response.document;
}

export async function getProjectEvents(projectId: string): Promise<RuntimeEvent[]> {
  return (await get<EventListResponse>(`/api/projects/${projectId}/events`)).events;
}

export async function getAllEvents(): Promise<RuntimeEvent[]> {
  return (await get<EventListResponse>("/api/events")).events;
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
  return (await get<ConnectionsResponse>("/api/settings/connections")).connections;
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  return (await get<{ providers: ProviderSettings }>("/api/settings/providers")).providers;
}

export async function updateProviderSettings(
  settings: Partial<ProviderSettings>,
): Promise<ProviderSettings> {
  return (await put<{ providers: ProviderSettings }>("/api/settings/providers", settings))
    .providers;
}

export async function updateProjectExplorer(
  projectId: string,
  input: UpdateExplorerConfigInput,
): Promise<ExplorerConfigRecord> {
  return (await put<ExplorerResponse>(`/api/projects/${projectId}/explorer`, input)).explorer;
}

export type ChatProviderStatus = { id: string; available: boolean };

export async function getChatProviders(): Promise<ChatProviderStatus[]> {
  return (await get<{ providers: ChatProviderStatus[] }>("/api/chat/providers")).providers;
}

export async function getChatMessages(projectId: string): Promise<ChatMessage[]> {
  return get<ChatMessage[]>(`/api/projects/${projectId}/chat/messages`);
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
  await del(`/api/projects/${projectId}/insight-cards/${cardId}`);
}
