import type { ChatModelSelection } from "@jobseeker/contracts";
import type { FoundJob } from "./jobTypes";

export interface ExplorerProgress {
  phase:
    | "query_started"
    | "query_finished"
    | "crawl_step"
    | "codex_raw"
    | "codex_event"
    | "job_found";
  domain: string;
  query: string;
  currentQuery: number;
  totalQueries: number;
  model?: string;
  effort?: string;
  jobsFound?: number;
  step?: number;
  url?: string;
  action?: string;
  params?: unknown;
  ok?: boolean;
  result?: string;
  retry?: boolean;
  raw?: string;
  job?: FoundJob;
  score?: number;
  reasons?: string[];
  gaps?: string[];
  /** Codex SDK event kind when phase === "codex_event" (e.g. reasoning, web_search). */
  eventKind?: string;
  /** Compact text payload for codex_event (reasoning summary, command, query, etc.). */
  eventText?: string;
}

export interface ExplorerRunOptions {
  modelSelection?: ChatModelSelection;
  onProgress?: (progress: ExplorerProgress) => void | Promise<void>;
}
