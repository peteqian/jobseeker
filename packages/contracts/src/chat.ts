export type ChatMessageRole = "user" | "assistant" | "system";

export type InsightCategory = "positioning" | "evidence" | "reframing" | "gap" | "other";

export type InsightStatus = "active" | "dismissed";

export interface ChatMessage {
  id: string;
  projectId: string;
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
  projectId: string;
  content: string;
}
