import type { ExplorerFeedItem } from "../-explorer.types";

/** Newest explorer_discovery task id from the event stream, or null. */
export function latestExplorerTaskId(
  events: import("@jobseeker/contracts").RuntimeEvent[],
): string | null {
  let latest: { taskId: string; createdAt: string } | null = null;
  for (const event of events) {
    if (event.type !== "task.started") continue;
    const payload = event.payload as Record<string, unknown>;
    if (payload.taskType !== "explorer_discovery") continue;
    const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
    if (!taskId) continue;
    if (!latest || new Date(event.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
      latest = { taskId, createdAt: event.createdAt };
    }
  }
  return latest?.taskId ?? null;
}

/** Turns an SDK action / event name (snake_case) into a readable verb. */
function humanizeAction(name: string): string {
  const text = name.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clip(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function toExplorerFeed(
  events: import("@jobseeker/contracts").RuntimeEvent[],
  taskId: string | null,
): ExplorerFeedItem[] {
  if (!taskId) return [];

  const feed: ExplorerFeedItem[] = [];
  const push = (item: ExplorerFeedItem) => feed.push(item);

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    const eventTaskId = typeof payload.taskId === "string" ? payload.taskId : null;
    if (eventTaskId !== taskId) continue;

    const taskType = typeof payload.taskType === "string" ? payload.taskType : null;
    const isExplorerTaskEvent =
      (event.type === "task.progress" ||
        event.type === "task.started" ||
        event.type === "task.interrupted" ||
        event.type === "task.completed" ||
        event.type === "task.failed") &&
      taskType === "explorer_discovery";

    if (!isExplorerTaskEvent && event.type !== "jobs.updated") continue;

    const base = { id: event.id, createdAt: event.createdAt } as const;

    if (event.type === "task.started") {
      push({ ...base, kind: "outcome", tone: "info", label: "Explorer run started" });
      continue;
    }
    if (event.type === "task.failed") {
      const detail = typeof payload.error === "string" ? payload.error : "Unknown task failure.";
      push({ ...base, kind: "outcome", tone: "error", label: "Explorer run failed", detail });
      continue;
    }
    if (event.type === "task.interrupted") {
      push({ ...base, kind: "outcome", tone: "info", label: "Explorer run stopped" });
      continue;
    }
    if (event.type === "task.completed") {
      push({ ...base, kind: "outcome", tone: "success", label: "Explorer run completed" });
      continue;
    }
    if (event.type === "jobs.updated") {
      const jobsCreated = typeof payload.jobsCreated === "number" ? payload.jobsCreated : 0;
      const domainsProcessed =
        typeof payload.domainsProcessed === "number" ? payload.domainsProcessed : 0;
      const queriesRun = typeof payload.queriesRun === "number" ? payload.queriesRun : 0;
      push({
        ...base,
        kind: "outcome",
        tone: "success",
        label: `Saved ${jobsCreated} jobs`,
        detail: `${domainsProcessed} domains, ${queriesRun} queries`,
      });
      continue;
    }

    if (event.type !== "task.progress") continue;

    const phase = typeof payload.phase === "string" ? payload.phase : "";
    const domain = typeof payload.domain === "string" ? payload.domain : "unknown domain";
    const query = typeof payload.query === "string" ? payload.query : "query";
    const currentQuery = typeof payload.currentQuery === "number" ? payload.currentQuery : 0;
    const totalQueries = typeof payload.totalQueries === "number" ? payload.totalQueries : 0;
    const jobsFound = typeof payload.jobsFound === "number" ? payload.jobsFound : null;
    const progressText =
      currentQuery > 0 && totalQueries > 0 ? `${currentQuery}/${totalQueries}` : "in progress";

    if (phase === "awaiting_login") {
      push({
        ...base,
        kind: "outcome",
        tone: "info",
        label: `Sign-in required on ${domain}`,
        detail: typeof payload.message === "string" ? payload.message : undefined,
      });
      continue;
    }
    if (phase === "blocked") {
      push({
        ...base,
        kind: "outcome",
        tone: "error",
        label: `Blocked on ${domain}`,
        detail: typeof payload.message === "string" ? payload.message : undefined,
      });
      continue;
    }
    if (phase === "query_started") {
      push({
        ...base,
        kind: "outcome",
        tone: "info",
        label: `Searching ${domain}`,
        detail: `${progressText} · ${query}`,
      });
      continue;
    }
    if (phase === "query_finished") {
      push({
        ...base,
        kind: "outcome",
        tone: "success",
        label: `Finished ${domain}`,
        detail: `${progressText} · ${query} · ${jobsFound ?? 0} jobs`,
      });
      continue;
    }
    if (phase === "job_found") {
      const job = (payload.job ?? {}) as Record<string, unknown>;
      const title = typeof job.title === "string" ? job.title : "Untitled";
      const company = typeof job.company === "string" ? job.company : "Unknown company";
      push({
        ...base,
        kind: "outcome",
        tone: "success",
        label: `Saved ${title}`,
        detail: `${company} · ${domain}`,
      });
      continue;
    }
    // Granular live stream: each browser action the agent takes.
    if (phase === "crawl_step") {
      const action = typeof payload.action === "string" ? payload.action : "step";
      const ok = payload.ok !== false;
      const result = typeof payload.result === "string" ? payload.result : "";
      push({
        ...base,
        kind: "step",
        tone: ok ? "info" : "error",
        label: humanizeAction(action),
        detail: result ? clip(result) : undefined,
      });
      continue;
    }
    // The agent's reasoning / web-search narration.
    if (phase === "codex_event") {
      const eventKind = typeof payload.eventKind === "string" ? payload.eventKind : "event";
      const eventText = typeof payload.eventText === "string" ? payload.eventText : "";
      if (!eventText) continue;
      push({
        ...base,
        kind: "event",
        tone: "info",
        label: eventKind === "reasoning" ? "Thinking" : humanizeAction(eventKind),
        detail: clip(eventText),
      });
    }
  }

  return feed.slice(-80).reverse();
}
