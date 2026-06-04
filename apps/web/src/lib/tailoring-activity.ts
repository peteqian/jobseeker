import type { RuntimeEvent } from "@jobseeker/contracts";

export type TailoringTaskType = "resume_tailoring" | "cover_letter_tailoring";

export const TAILORING_TASK_TYPES = new Set<string>(["resume_tailoring", "cover_letter_tailoring"]);

export interface TailoringEventPayload {
  taskId?: string;
  taskType?: string;
  jobId?: string;
  phase?: string;
  pass?: number;
  score?: number | null;
  issueCount?: number;
  pages?: number;
  maxPages?: number;
  error?: string;
}

export interface TailoringActivityItem {
  id: string;
  createdAt: string;
  label: string;
  detail?: string;
  tone: "info" | "success" | "error" | "active";
}

function docNoun(taskType: string): string {
  return taskType === "resume_tailoring" ? "Resume" : "Cover letter";
}

export function isTailoringEvent(event: RuntimeEvent): boolean {
  const payload = event.payload as TailoringEventPayload;
  return typeof payload.taskType === "string" && TAILORING_TASK_TYPES.has(payload.taskType);
}

export function describeTailoringEvent(event: RuntimeEvent): TailoringActivityItem | null {
  const payload = event.payload as TailoringEventPayload;
  const noun = docNoun(payload.taskType ?? "");
  const base = { id: event.id, createdAt: event.createdAt };

  switch (event.type) {
    case "task.started":
      return { ...base, label: `${noun} generation started`, tone: "info" };
    case "task.completed":
      return { ...base, label: `${noun} generation finished`, tone: "success" };
    case "task.failed":
      return {
        ...base,
        label: `${noun} generation failed`,
        detail: payload.error,
        tone: "error",
      };
    case "task.interrupted":
      return { ...base, label: `${noun} generation interrupted`, tone: "error" };
    case "task.progress":
      break;
    default:
      return null;
  }

  switch (payload.phase) {
    case "loading_context":
      return { ...base, label: `${noun}: loading job & profile context`, tone: "active" };
    case "generating":
      return { ...base, label: `${noun}: drafting with AI`, tone: "active" };
    case "reviewing":
      return {
        ...base,
        label: `${noun}: recruiter reviewing draft`,
        detail: payload.pass ? `pass ${payload.pass}` : undefined,
        tone: "active",
      };
    case "revising": {
      const parts: string[] = [];
      if (typeof payload.score === "number") parts.push(`score ${payload.score}`);
      if (payload.issueCount) parts.push(`${payload.issueCount} issues`);
      if (payload.pages && payload.maxPages && payload.pages > payload.maxPages) {
        parts.push(`${payload.pages} pages (max ${payload.maxPages})`);
      }
      return {
        ...base,
        label: `${noun}: revising draft`,
        detail: parts.join(" · ") || undefined,
        tone: "active",
      };
    }
    case "completed":
      return {
        ...base,
        label: `${noun}: document ready`,
        detail: typeof payload.score === "number" ? `final score ${payload.score}` : undefined,
        tone: "success",
      };
    default:
      return null;
  }
}

/**
 * Per-job tailoring task types still in flight: a task is generating when its
 * task.started has no matching terminal event. Two passes so the result does
 * not depend on event order. Survives remounts and page reloads, unlike
 * component-local state.
 */
export function deriveGeneratingByJob(events: RuntimeEvent[]): Map<string, Set<TailoringTaskType>> {
  const terminalTaskIds = new Set<string>();
  for (const event of events) {
    if (
      event.type === "task.completed" ||
      event.type === "task.failed" ||
      event.type === "task.interrupted"
    ) {
      const payload = event.payload as TailoringEventPayload;
      if (typeof payload.taskId === "string") terminalTaskIds.add(payload.taskId);
    }
  }

  const map = new Map<string, Set<TailoringTaskType>>();
  for (const event of events) {
    if (event.type !== "task.started") continue;
    const payload = event.payload as TailoringEventPayload;
    if (
      typeof payload.taskId === "string" &&
      !terminalTaskIds.has(payload.taskId) &&
      typeof payload.jobId === "string" &&
      typeof payload.taskType === "string" &&
      TAILORING_TASK_TYPES.has(payload.taskType)
    ) {
      const set = map.get(payload.jobId) ?? new Set<TailoringTaskType>();
      set.add(payload.taskType as TailoringTaskType);
      map.set(payload.jobId, set);
    }
  }

  return map;
}
