import type {
  ChatMessage,
  ChatModelSelection,
  ChatThread,
  ExplorerDomainConfig,
  JobMatch,
  JobRecord,
} from "@jobseeker/contracts";
import type { SortingState } from "@tanstack/react-table";
import type { ProviderOption } from "@/components/chat/provider-model-picker";
import type { useModelChoice } from "@/hooks/use-model-choice";

export interface ExplorerRawLogLine {
  id: string;
  createdAt: string;
  text: string;
}

export type SessionStreamItem =
  | {
      kind: "log";
      id: string;
      createdAt: string;
      text: string;
    }
  | {
      kind: "message";
      id: string;
      createdAt: string;
      role: ChatMessage["role"];
      content: string;
    };

export interface ExplorerFeedItem {
  id: string;
  createdAt: string;
  tone: "info" | "success" | "error";
  label: string;
  detail?: string;
}

export interface ExplorerRunSession {
  thread: ChatThread;
  threadId: string;
  taskId: string | null;
}

export interface ConfigTabProps {
  domains: ExplorerDomainConfig[];
  stats: ReturnType<typeof import("@/lib/explorer").getExplorerStats>;
  addDomainInput: string;
  setAddDomainInput: (value: string) => void;
  onAddDomain: () => void;
  onToggleEnabled: (domain: ExplorerDomainConfig, enabled: boolean) => void;
  onEditDomain: (domain: string) => void;
  sorting: SortingState;
  setSorting: (value: SortingState) => void;
  includeAgentSuggestions: boolean;
  modelProviders: ProviderOption[];
  modelSelection?: ChatModelSelection;
  modelProvidersLoading: boolean;
  isDirty: boolean;
  busyAction: string | null;
  hasProfile: boolean;
  hasExplorerModel: boolean;
  onModelSelectionChange: (selection: ChatModelSelection) => void;
  onSave: () => void;
  onRun: () => void;
  onDiscard: () => void;
  onOpenSettings: () => void;
}

export interface ConfigureRunTabProps extends ConfigTabProps, ManageTabProps {}

export interface DomainConfigFormProps {
  config: ExplorerDomainConfig;
  suggestions: import("@/lib/explorer").ExplorerQuerySuggestion[];
  onChange: (next: ExplorerDomainConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}

export interface ResultsTabProps {
  projectId: string;
  domains: ExplorerDomainConfig[];
  jobs: JobRecord[];
  matches: JobMatch[];
  documents: import("@jobseeker/contracts").ProjectDocument[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onDeleteJob: (projectId: string, jobId: string) => Promise<void>;
  onGenerate: (jobId: string, type: "resume_tailoring" | "cover_letter_tailoring") => void;
  busyAction: string | null;
}

export interface ManageTabProps {
  sessions: ChatThread[];
  activeThreadId: string | null;
  onSelectSession: (threadId: string) => void;
  logs: ExplorerRawLogLine[];
  feed: ExplorerFeedItem[];
  isRunning: boolean;
  debugProviders: ReturnType<typeof useModelChoice>["providers"];
  debugSelection: ChatModelSelection | undefined;
  onDebugSelectionChange: (selection: ChatModelSelection) => void;
  debugMessages: ChatMessage[];
  debugStreamingContent: string;
  debugIsStreaming: boolean;
  debugError: string | null;
  onSendDebugMessage: (content: string) => void;
  onInterruptDebugMessage: () => void;
}

export interface ExplorerLiveFeedProps {
  items: ExplorerFeedItem[];
  isRunning: boolean;
}

export interface DomainRailButtonProps {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}

export interface JobResultCardProps {
  job: JobRecord;
  match?: JobMatch;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onGenerate: (type: "resume_tailoring" | "cover_letter_tailoring") => void;
  busyAction: string | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
}
