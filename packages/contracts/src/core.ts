export type ProjectStatus = "idle" | "running" | "waiting_for_user" | "completed" | "failed";

export type TaskType =
  | "resume_ingest"
  | "explorer_discovery"
  | "job_discovery"
  | "resume_tailoring";

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
  | "semantic_profile"
  | "tailored_resume";

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
  | "profile.updated";

export type JobSource = "seek" | "explorer";

export type ExplorerPresetId = "australia-general" | "product-engineering" | "ai-and-data";
