import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  activeResumeSourceId: text("active_resume_source_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull(),
  providerTurnId: text("provider_turn_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  error: text("error"),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  mimeType: text("mime_type").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  content: text("content"),
  createdAt: text("created_at").notNull(),
});

export const explorerConfigs = sqliteTable("explorer_configs", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  domainsJson: text("domains_json").notNull(),
  includeAgentSuggestions: integer("include_agent_suggestions", {
    mode: "boolean",
  }).notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull(),
  prompt: text("prompt").notNull(),
  fieldsJson: text("fields_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const questionAnswers = sqliteTable("question_answers", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  questionPrompt: text("question_prompt").notNull(),
  fieldId: text("field_id").notNull(),
  fieldLabel: text("field_label").notNull(),
  answerJson: text("answer_json").notNull(),
  answeredAt: text("answered_at").notNull(),
});

export const questionCards = sqliteTable("question_cards", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  path: text("path").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  url: text("url").notNull(),
  summary: text("summary").notNull(),
  salary: text("salary"),
  createdAt: text("created_at").notNull(),
});

export const jobMatches = sqliteTable(
  "job_matches",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    reasonsJson: text("reasons_json").notNull(),
    gapsJson: text("gaps_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.projectId] })],
);

export const profiles = sqliteTable("profiles", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  profileJson: text("profile_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  threadId: text("thread_id").references(() => chatThreads.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const providerSessionRuntime = sqliteTable("provider_session_runtime", {
  threadId: text("thread_id")
    .primaryKey()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  providerName: text("provider_name").notNull(),
  adapterKey: text("adapter_key").notNull(),
  status: text("status").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  resumeCursorJson: text("resume_cursor_json"),
  runtimePayloadJson: text("runtime_payload_json"),
});

export const threadCommands = sqliteTable("thread_commands", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  commandType: text("command_type").notNull(),
  commandJson: text("command_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const threadEvents = sqliteTable("thread_events", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  eventType: text("event_type").notNull(),
  eventJson: text("event_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const threadProjections = sqliteTable("thread_projections", {
  threadId: text("thread_id")
    .primaryKey()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  latestSequence: integer("latest_sequence").notNull(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const topicFiles = sqliteTable("topic_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  filePath: text("file_path").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insightCards = sqliteTable("insight_cards", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  chatMessageId: text("chat_message_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  createdAt: text("created_at").notNull(),
  payloadJson: text("payload_json").notNull(),
});
