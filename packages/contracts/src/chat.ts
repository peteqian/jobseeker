export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatScope = "coach" | "explorer";

export type ChatThreadStatus = "active" | "archived";

export interface ChatThread {
  id: string;
  projectId: string;
  scope: ChatScope;
  title: string;
  status: ChatThreadStatus;
  createdAt: string;
  updatedAt: string;
}

export type InsightCategory = "positioning" | "evidence" | "reframing" | "gap" | "other";

export type InsightStatus = "active" | "dismissed";

export interface ChatMessage {
  id: string;
  projectId: string;
  threadId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface InsightCard {
  id: string;
  projectId: string;
  chatMessageId: string | null;
  title: string;
  body: string;
  category: InsightCategory;
  status: InsightStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SendChatMessageInput {
  threadId: string;
  content: string;
}
