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
  /** Re-check found job URLs daily and mark listings that have expired. */
  checkExpiredDaily?: boolean;
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
  /** Set when the daily expiry check found the listing no longer available. */
  expiredAt?: string | null;
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

/**
 * Where a tracked application sits in the hiring funnel. Set by the user once
 * they actually apply; jobs without a row are not yet tracked.
 */
export type ApplicationStatus = "applied" | "interviewing" | "offer" | "accepted" | "rejected";

export interface JobApplication {
  projectId: string;
  jobId: string;
  status: ApplicationStatus;
  appliedAt: string;
  /** Interview rounds completed (or scheduled) so far. */
  interviewRounds: number;
  notes?: string;
  updatedAt: string;
}

export interface UpdateJobApplicationInput {
  status: ApplicationStatus;
  interviewRounds?: number;
  notes?: string;
}

export interface TailoringIssue {
  severity: "high" | "medium" | "low";
  issue: string;
  fix: string;
}

/**
 * The recruiter's screening call: would they advance this candidate for this
 * job? Mirrors how a real screen ends — not with a number, but a decision.
 */
export type TailoringShortlist = "strong_yes" | "yes" | "maybe" | "no";

/**
 * A recruiter's verdict on a tailored document, stored per job + kind and
 * surfaced next to the document so the user sees what was flagged.
 *
 * Two separate judgments, the way a real recruiter screens:
 * - `score` (presentation): given the candidate's true background, how well
 *   does the document sell it? Fully fixable by editing — the revise loop
 *   chases this.
 * - `fitScore`: how well the candidate's actual background matches the role.
 *   Editing cannot move it; it informs job choice, not revision.
 */
export interface TailoringReview {
  projectId: string;
  jobId: string;
  /** Matches the tailoring TaskType: "resume_tailoring" | "cover_letter_tailoring". */
  kind: string;
  documentId: string;
  /** 0-100 presentation quality of the document given the candidate's real background. */
  score: number;
  /** 0-100 candidate-vs-role fit from facts alone. Null on reviews from before the split. */
  fitScore: number | null;
  /** Recruiter's advance/pass call. Null on reviews from before the split. */
  shortlist: TailoringShortlist | null;
  /** Unfixable gaps (missing stack, availability…) — job-choice signal, not edit instructions. */
  gaps: string[];
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
  fitScore: number | null;
  shortlist: TailoringShortlist | null;
  gaps: string[];
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
  jobApplications: JobApplication[];
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
