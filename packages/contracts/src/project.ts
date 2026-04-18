import type { ChatMessage, InsightCard } from "./chat";
import type { TopicFileMeta } from "./topic";
import type {
  ExplorerPresetId,
  JobSource,
  RuntimeEventType,
  TaskStatus,
  TaskType,
  ProjectDocumentKind,
  ProjectStatus,
} from "./core";
import type { StructuredProfile } from "./profile";
import type { QuestionAnswerRecord, QuestionCard, PendingQuestion } from "./questions";

export interface ExplorerConfigRecord {
  projectId: string;
  domains: string[];
  presetIds: ExplorerPresetId[];
  includeAgentSuggestions: boolean;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  slug: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  type: TaskType;
  status: TaskStatus;
  providerTurnId?: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  kind: ProjectDocumentKind;
  mimeType: string;
  name: string;
  path: string;
  content?: string;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  projectId: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  url: string;
  summary: string;
  salary?: string;
  createdAt: string;
}

export interface JobMatch {
  jobId: string;
  projectId: string;
  score: number;
  reasons: string[];
  gaps: string[];
}

export interface RuntimeEvent<TPayload = Record<string, unknown>> {
  id: string;
  projectId: string;
  type: RuntimeEventType;
  createdAt: string;
  payload: TPayload;
}

export interface ProjectSnapshot {
  project: ProjectRecord;
  tasks: TaskRecord[];
  documents: ProjectDocument[];
  chatMessages: ChatMessage[];
  insightCards: InsightCard[];
  questionCards: QuestionCard[];
  questions: PendingQuestion[];
  questionHistory: QuestionAnswerRecord[];
  jobs: JobRecord[];
  jobMatches: JobMatch[];
  explorer: ExplorerConfigRecord;
  topicFiles: TopicFileMeta[];
  profile: StructuredProfile | null;
  activeResumeSourceId: string | null;
}

export interface ResumeVersion {
  document: ProjectDocument;
  extractedDocument: ProjectDocument | null;
  isActive: boolean;
  uploadedAt: string;
}

export interface CreateProjectInput {
  title: string;
}

export interface StartTaskInput {
  projectId: string;
  type: TaskType;
  input?: string;
  jobId?: string;
  modelSelection?: import("./model").ChatModelSelection;
}

export interface ResumePasteInput {
  text: string;
  name?: string;
}

export interface UpdateExplorerConfigInput {
  domains: string[];
  presetIds: ExplorerPresetId[];
  includeAgentSuggestions: boolean;
}

export interface ResumeUploadResult {
  sourceDocument: ProjectDocument;
  extractedDocument: ProjectDocument;
  versions: ResumeVersion[];
}
