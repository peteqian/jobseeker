import type {
  ExplorerDomainConfig,
  JobMatch,
  JobRecord,
  ProjectDocument,
} from "@jobseeker/contracts";
import type { JobStage } from "@/lib/job-stage";

export interface ExplorerFeedItem {
  id: string;
  createdAt: string;
  tone: "info" | "success" | "error";
  /**
   * "outcome" — a milestone (jobs found, run status); rendered prominently.
   * "step"/"event" — granular live actions/reasoning; rendered subtly.
   */
  kind: "outcome" | "step" | "event";
  label: string;
  detail?: string;
}

export interface ResultsTabProps {
  projectId: string;
  domains: ExplorerDomainConfig[];
  jobs: JobRecord[];
  matches: JobMatch[];
  documents: ProjectDocument[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onDeleteJob: (projectId: string, jobId: string) => Promise<void>;
  onGenerate: (jobId: string, type: "resume_tailoring" | "cover_letter_tailoring") => void;
  onApply: (job: JobRecord) => void;
  busyAction: string | null;
}

export interface ExplorerLiveFeedProps {
  items: ExplorerFeedItem[];
  isRunning: boolean;
}

export interface JobResultCardProps {
  job: JobRecord;
  match?: JobMatch;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onGenerate: (type: "resume_tailoring" | "cover_letter_tailoring") => void;
  busyAction: string | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  /** Pipeline position shown as a badge; derived in ResultsTab. */
  stage: JobStage;
}
