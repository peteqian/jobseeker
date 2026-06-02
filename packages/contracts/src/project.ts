import type { ChatMessage, ChatThread, InsightCard } from "./chat";
import type { TopicFileMeta } from "./topic";
import type {
  ExplorerFreshness,
  JobSource,
  RuntimeEventType,
  TaskStatus,
  TaskType,
  ProjectDocumentKind,
  ProjectStatus,
} from "./core";
import type { StructuredProfile } from "./profile";
import type { RemotePreference } from "./explorer-projections";
import type { QuestionAnswerRecord, QuestionCard, PendingQuestion } from "./questions";

export interface ExplorerDomainConfig {
  domain: string;
  enabled: boolean;
  /**
   * Legacy per-domain fields. Search is now a single shared set per run
   * (`ExplorerSearchConfig`); these are retained as optional only so existing
   * persisted rows still parse. Do not write them in new code.
   */
  queries?: string[];
  jobLimit?: number;
  freshness?: ExplorerFreshness;
}

/**
 * The one shared search set applied across all enabled domains in a run. Roles
 * drive the per-domain queries; location/arrangement/freshness/limit are global.
 */
export type ExplorerRunMode = "sequential" | "parallel";

export interface ExplorerSearchConfig {
  roles: string[];
  locationText?: string;
  remotePreference?: RemotePreference;
  freshness: ExplorerFreshness;
  jobLimit: number;
  /** Run queries one at a time (default) or fan out in parallel. */
  runMode?: ExplorerRunMode;
}

export interface ExplorerConfigRecord {
  projectId: string;
  domains: ExplorerDomainConfig[];
  search: ExplorerSearchConfig;
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
  jobId?: string | null;
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

/**
 * How well the candidate fits a job, judged by reading the full job description
 * against the whole profile. `pending` means the match pass has not scored it
 * yet (the row exists, the LLM verdict is still in flight).
 */
export type MatchLevel = "exact" | "partial" | "no_match" | "pending";

export interface JobMatch {
  jobId: string;
  projectId: string;
  /** Primary signal. `score` is kept only as a secondary sort within a level. */
  level: MatchLevel;
  score: number;
  reasons: string[];
  gaps: string[];
}

export interface TailoringIssue {
  severity: "high" | "medium" | "low";
  issue: string;
  fix: string;
}

/**
 * A recruiter's verdict on a tailored document, stored per job + kind and
 * surfaced next to the document so the user sees what was flagged.
 */
export interface TailoringReview {
  projectId: string;
  jobId: string;
  /** Matches the tailoring TaskType: "resume_tailoring" | "cover_letter_tailoring". */
  kind: string;
  documentId: string;
  /** 0-100 interview-readiness for this job. */
  score: number;
  issues: TailoringIssue[];
  createdAt: string;
}

/** One past recruiter review, kept so the user can see score history per doc. */
export interface TailoringReviewHistoryEntry {
  id: string;
  jobId: string;
  kind: string;
  documentId: string;
  score: number;
  issues: TailoringIssue[];
  createdAt: string;
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
  chatThreads: ChatThread[];
  chatMessages: ChatMessage[];
  insightCards: InsightCard[];
  questionCards: QuestionCard[];
  questions: PendingQuestion[];
  questionHistory: QuestionAnswerRecord[];
  jobs: JobRecord[];
  jobMatches: JobMatch[];
  tailoringReviews: TailoringReview[];
  tailoringReviewHistory: TailoringReviewHistoryEntry[];
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
  resumeDocId?: string;
  focusArea?: string;
  deepReview?: boolean;
  pastedJds?: string[];
  useExplorer?: boolean;
  modelSelection?: import("./model").ChatModelSelection;
}

export interface ResumePasteInput {
  text: string;
  name?: string;
}

export interface UpdateExplorerConfigInput {
  domains: ExplorerDomainConfig[];
  search: ExplorerSearchConfig;
  includeAgentSuggestions: boolean;
}

export interface ResumeUploadResult {
  sourceDocument: ProjectDocument;
  extractedDocument: ProjectDocument;
  versions: ResumeVersion[];
}
