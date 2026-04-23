export type ProjectStatus = "idle" | "running" | "waiting_for_user" | "completed" | "failed";

export type TaskType =
  | "resume_ingest"
  | "explorer_discovery"
  | "job_discovery"
  | "resume_tailoring"
  | "cover_letter_tailoring"
  | "coach_review";

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "interrupted";

export type ProjectDocumentKind =
  | "resume_source"
  | "extracted_text"
  | "tailored_resume"
  | "cover_letter";

export type RuntimeEventType =
  | "project.created"
  | "resume.uploaded"
  | "resume.activated"
  | "explorer.updated"
  | "task.started"
  | "task.progress"
  | "task.waiting_for_user"
  | "task.completed"
  | "task.failed"
  | "document.created"
  | "jobs.updated"
  | "profile.updated"
  | "thread.command.dispatched"
  | "thread.runtime.event"
  | "thread.stream.event";

export type JobSource = "seek" | "explorer";

export type ExplorerFreshness = "24h" | "week" | "month" | "any";
