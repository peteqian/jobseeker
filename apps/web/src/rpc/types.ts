import type { TopicFileMeta } from "@jobseeker/contracts";

export interface ChatStreamDelta {
  type: "delta";
  chunk: string;
}

export interface ChatStreamTopicUpdate {
  type: "topicUpdate";
  topicId: string;
  slug: string;
  title: string;
  status: "in-progress" | "complete";
  content: string;
}

export interface ChatStreamComplete {
  type: "complete";
  messageId: string;
  content: string;
  topicUpdates: TopicFileMeta[];
}

export type ChatStreamEvent = ChatStreamDelta | ChatStreamTopicUpdate | ChatStreamComplete;
