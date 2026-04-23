export const projectsKeys = {
  all: () => ["projects"] as const,
  list: () => ["projects", "list"] as const,
  detail: (projectId: string) => ["projects", "detail", projectId] as const,
  resumeVersions: (projectId: string) => ["projects", projectId, "resume-versions"] as const,
};

export const settingsKeys = {
  connections: () => ["settings", "connections"] as const,
  providers: () => ["settings", "providers"] as const,
};

export const chatKeys = {
  providers: () => ["chat", "providers"] as const,
  threads: (projectId: string, scope: string) => ["chat", "threads", projectId, scope] as const,
  messages: (threadId: string) => ["chat", "messages", threadId] as const,
  projection: (threadId: string) => ["chat", "projection", threadId] as const,
  topics: (projectId: string) => ["chat", "topics", projectId] as const,
  topic: (projectId: string, topicId: string) => ["chat", "topic", projectId, topicId] as const,
};

export const coachKeys = {
  review: (projectId: string) => ["coach", "review", projectId] as const,
  claimThreads: (claimId: string) => ["coach", "claim-threads", claimId] as const,
};

export const eventsKeys = {
  all: () => ["events", "all"] as const,
  project: (projectId: string) => ["events", "project", projectId] as const,
};

export const jobseekerKeys = {
  uiError: () => ["jobseeker", "ui", "error"] as const,
};
