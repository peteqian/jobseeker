export type TopicFileStatus = "in-progress" | "complete";

export interface TopicFileMeta {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  status: TopicFileStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TopicFile extends TopicFileMeta {
  content: string;
}
