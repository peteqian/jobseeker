import type { ChatThread } from "@jobseeker/contracts";

export interface SessionSidebarProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  onToggleVisibility: () => void;
  expanded: boolean;
}

export interface ResumeBannerProps {
  resumeDoc: { name: string } | null;
  activeThread: ChatThread | null;
  projectSlug: string;
}
