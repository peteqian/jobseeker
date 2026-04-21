import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ChatMessage,
  ChatModelSelection,
  ChatThread,
  ExplorerDomainConfig,
  ExplorerFreshness,
  JobMatch,
  JobRecord,
  RuntimeEvent,
} from "@jobseeker/contracts";
import {
  ArrowUpDown,
  ExternalLink,
  FileSearch,
  Info,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat/chat-input";
import { ProviderModelPicker, type ProviderOption } from "@/components/chat/provider-model-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  FRESHNESS_LABELS,
  addQueryToDomain,
  createDomainConfig,
  getExplorerQuerySuggestions,
  getExplorerStats,
  parseDomainLines,
  removeDomainConfig,
  removeQueryFromDomain,
  upsertDomainConfig,
  type ExplorerQuerySuggestion,
} from "@/lib/explorer";
import { useChat } from "@/hooks/use-chat";
import { useModelChoice } from "@/hooks/use-model-choice";
import { useJobseeker, useProjectEvents } from "@/providers/jobseeker-hooks";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import { createThread, listThreads } from "@/rpc/chat-client";

export const Route = createFileRoute("/projects/$projectId/explorer")({
  component: ExplorerPage,
});

const FRESHNESS_OPTIONS: ExplorerFreshness[] = ["24h", "week", "month", "any"];

function ExplorerPage() {
  const { project } = useProject();
  const projectId = project.project.id;
  const { busyAction, startTask, saveExplorer } = useJobseeker();
  const events = useProjectEvents(projectId);
  const {
    providers: explorerProviders,
    selection: explorerSelection,
    setSelection: setExplorerSelection,
    providersLoading: explorerProvidersLoading,
  } = useModelChoice(projectId, "explorer");
  const hasProfile = Boolean(project.profile);
  const savedDomains = project.explorer.domains;
  const savedIncludeAgentSuggestions = project.explorer.includeAgentSuggestions;

  const [draftDomains, setDraftDomains] = useState<ExplorerDomainConfig[]>(savedDomains);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draftIncludeAgent, setDraftIncludeAgent] = useState(savedIncludeAgentSuggestions);
  const [addDomainInput, setAddDomainInput] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "domain", desc: false }]);
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setDraftDomains(savedDomains);
  }, [savedDomains]);

  useEffect(() => {
    setDraftIncludeAgent(savedIncludeAgentSuggestions);
  }, [savedIncludeAgentSuggestions]);

  useEffect(() => {
    let cancelled = false;
    void listThreads(projectId, "explorer").then((rows) => {
      if (cancelled) return;
      setThreads(rows);
      const runThreads = rows.filter((thread) => thread.title.startsWith("Run "));
      const latestRun = [...runThreads].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
      setActiveThreadId((current) => current ?? latestRun?.id ?? rows[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const shellHeader = useMemo(
    () => ({
      title: "Explorer",
      description: "Configure search scope and review the roles discovered for this project.",
    }),
    [],
  );
  useShellHeaderMeta(shellHeader);

  const querySuggestions = useMemo(
    () => getExplorerQuerySuggestions(project.profile),
    [project.profile],
  );

  const stats = useMemo(() => getExplorerStats(draftDomains), [draftDomains]);
  const runSessions = useMemo(() => buildExplorerRunSessions(threads, events), [threads, events]);
  const activeRunTaskId = useMemo(
    () => runSessions.find((session) => session.threadId === activeThreadId)?.taskId ?? null,
    [runSessions, activeThreadId],
  );
  const runHistory = useMemo(() => runSessions.map((session) => session.thread), [runSessions]);
  const liveFeed = useMemo(
    () => toExplorerFeed(events, activeRunTaskId),
    [events, activeRunTaskId],
  );
  const rawLogs = useMemo(
    () => toExplorerRawLogs(events, activeRunTaskId),
    [events, activeRunTaskId],
  );
  const explorerModelProviders = useMemo(
    () => explorerProviders.filter((provider) => provider.id === "codex"),
    [explorerProviders],
  );
  const fallbackExplorerSelection = useMemo(() => {
    const codex = explorerModelProviders.find((provider) => provider.available);
    const model = codex?.models[0];
    if (!codex || !model) {
      return undefined;
    }
    return {
      provider: codex.id,
      model: model.slug,
      effort: model.capabilities.defaultEffort,
    } satisfies ChatModelSelection;
  }, [explorerModelProviders]);
  const effectiveExplorerSelection =
    explorerSelection?.provider === "codex" ? explorerSelection : fallbackExplorerSelection;

  useEffect(() => {
    if (!fallbackExplorerSelection || explorerSelection?.provider === "codex") {
      return;
    }
    setExplorerSelection(fallbackExplorerSelection);
  }, [explorerSelection?.provider, fallbackExplorerSelection, setExplorerSelection]);

  const {
    messages: debugMessages,
    streamingContent: debugStreamingContent,
    isStreaming: debugIsStreaming,
    error: debugError,
    send: sendDebugMessage,
    interrupt: interruptDebugMessage,
  } = useChat({
    projectId,
    threadId: activeThreadId ?? "",
    selection: effectiveExplorerSelection,
  });

  const isDirty = useMemo(
    () =>
      JSON.stringify(draftDomains) !== JSON.stringify(savedDomains) ||
      draftIncludeAgent !== savedIncludeAgentSuggestions,
    [draftDomains, draftIncludeAgent, savedDomains, savedIncludeAgentSuggestions],
  );

  const editingConfig = useMemo(
    () =>
      editingDomain ? (draftDomains.find((entry) => entry.domain === editingDomain) ?? null) : null,
    [draftDomains, editingDomain],
  );

  function handleAddDomain() {
    const parsed = parseDomainLines(addDomainInput);
    if (parsed.length === 0) return;

    const existing = new Set(draftDomains.map((entry) => entry.domain.toLowerCase()));
    const additions = parsed
      .filter((domain) => !existing.has(domain.toLowerCase()))
      .map((domain) => createDomainConfig(domain));

    if (additions.length === 0) {
      setAddDomainInput("");
      return;
    }

    setDraftDomains((current) => [...current, ...additions]);
    setAddDomainInput("");
  }

  function handleToggleEnabled(domain: ExplorerDomainConfig, enabled: boolean) {
    setDraftDomains((current) => upsertDomainConfig(current, { ...domain, enabled }));
  }

  function handleUpdateDomain(next: ExplorerDomainConfig) {
    setDraftDomains((current) => upsertDomainConfig(current, next));
  }

  function handleRemoveDomain(domain: string) {
    setDraftDomains((current) => removeDomainConfig(current, domain));
    if (editingDomain === domain) {
      setEditingDomain(null);
    }
  }

  async function persistDraft() {
    await saveExplorer(projectId, {
      domains: draftDomains,
      includeAgentSuggestions: draftIncludeAgent,
    });
  }

  async function handleRunExplorer() {
    if (isDirty) {
      await persistDraft();
    }

    const runThread = await createThread(
      projectId,
      "explorer",
      `Run ${new Date().toLocaleString()}`,
    );
    setThreads((prev) => [...prev, runThread]);
    setActiveThreadId(runThread.id);

    await startTask(
      {
        projectId,
        type: "explorer_discovery",
        modelSelection: effectiveExplorerSelection,
      },
      "explorer-discovery",
    );
  }

  function resetDraftFromSaved() {
    setDraftDomains(savedDomains);
    setDraftIncludeAgent(savedIncludeAgentSuggestions);
  }

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <Tabs defaultValue="config" className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="config">Config</TabsTrigger>
            <TabsTrigger value="results">
              Results
              {project.jobs.length > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {project.jobs.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="manage">Manage</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="config" className="m-0 min-h-0 flex-1 overflow-y-auto">
          <ConfigTab
            domains={draftDomains}
            stats={stats}
            addDomainInput={addDomainInput}
            setAddDomainInput={setAddDomainInput}
            onAddDomain={handleAddDomain}
            onToggleEnabled={handleToggleEnabled}
            onEditDomain={setEditingDomain}
            sorting={sorting}
            setSorting={setSorting}
            includeAgentSuggestions={draftIncludeAgent}
            modelProviders={explorerModelProviders}
            modelSelection={effectiveExplorerSelection}
            modelProvidersLoading={explorerProvidersLoading}
            isDirty={isDirty}
            busyAction={busyAction}
            hasProfile={hasProfile}
            hasExplorerModel={Boolean(effectiveExplorerSelection)}
            onModelSelectionChange={setExplorerSelection}
            onSave={() => void persistDraft()}
            onRun={() => void handleRunExplorer()}
            onDiscard={resetDraftFromSaved}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </TabsContent>

        <TabsContent value="results" className="m-0 min-h-0 flex-1 overflow-y-auto">
          <ResultsTab domains={savedDomains} jobs={project.jobs} matches={project.jobMatches} />
        </TabsContent>

        <TabsContent value="manage" className="m-0 min-h-0 flex-1 overflow-y-auto">
          <ManageTab
            sessions={runHistory}
            activeThreadId={activeThreadId}
            onSelectSession={setActiveThreadId}
            logs={rawLogs}
            feed={liveFeed}
            isRunning={busyAction === "explorer-discovery"}
            debugProviders={explorerModelProviders}
            debugSelection={effectiveExplorerSelection}
            onDebugSelectionChange={setExplorerSelection}
            debugMessages={debugMessages}
            debugStreamingContent={debugStreamingContent}
            debugIsStreaming={debugIsStreaming}
            debugError={debugError}
            onSendDebugMessage={sendDebugMessage}
            onInterruptDebugMessage={interruptDebugMessage}
          />
        </TabsContent>

        <Sheet
          open={editingConfig !== null}
          onOpenChange={(open) => {
            if (!open) setEditingDomain(null);
          }}
        >
          <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
            {editingConfig ? (
              <DomainConfigForm
                config={editingConfig}
                suggestions={querySuggestions}
                onChange={handleUpdateDomain}
                onRemove={() => handleRemoveDomain(editingConfig.domain)}
                onClose={() => setEditingDomain(null)}
              />
            ) : null}
          </SheetContent>
        </Sheet>

        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>Explorer settings</SheetTitle>
              <SheetDescription>Global defaults for discovery runs.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <label className="flex items-start gap-3 rounded-md border px-4 py-3">
                <Switch
                  checked={draftIncludeAgent}
                  onCheckedChange={(value) => setDraftIncludeAgent(value)}
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Agent domain suggestions</div>
                  <p className="text-xs text-muted-foreground">
                    Let the agent append additional job-board domains it discovers during a run.
                  </p>
                </div>
              </label>
            </div>
            <SheetFooter className="border-t px-6 py-4">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Close
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Tabs>
    </div>
  );
}

interface ExplorerRawLogLine {
  id: string;
  createdAt: string;
  text: string;
}

type SessionStreamItem =
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

function buildSessionStreamItems(
  messages: ChatMessage[],
  logs: ExplorerRawLogLine[],
  streamingContent: string,
): SessionStreamItem[] {
  const items: SessionStreamItem[] = [
    ...messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      createdAt: message.createdAt,
      role: message.role,
      content: message.content,
    })),
    ...logs.map((log) => ({
      kind: "log" as const,
      id: `log_${log.id}`,
      createdAt: log.createdAt,
      text: log.text,
    })),
  ];

  if (streamingContent.trim().length > 0) {
    items.push({
      kind: "message",
      id: "streaming_assistant",
      createdAt: new Date().toISOString(),
      role: "assistant",
      content: streamingContent,
    });
  }

  return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function ManageTab({
  sessions,
  activeThreadId,
  onSelectSession,
  logs,
  feed,
  isRunning,
  debugProviders,
  debugSelection,
  onDebugSelectionChange,
  debugMessages,
  debugStreamingContent,
  debugIsStreaming,
  debugError,
  onSendDebugMessage,
  onInterruptDebugMessage,
}: {
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
}) {
  const streamItems = useMemo(
    () => buildSessionStreamItems(debugMessages, logs, debugStreamingContent),
    [debugMessages, logs, debugStreamingContent],
  );

  return (
    <section className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,0.22fr)_minmax(0,0.43fr)_minmax(0,0.35fr)]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Explorer sessions</p>
          <p className="text-xs text-muted-foreground">Each run creates a new Codex session.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {sessions.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No sessions yet. Run Explorer to start one.
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  session.id === activeThreadId
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {session.title.replace("Run ", "")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Session stream</p>
          <p className="text-xs text-muted-foreground">
            Unified chat and Codex output for this run.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {debugError ? (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {debugError}
            </div>
          ) : null}
          {streamItems.length === 0 ? (
            <p className="flex h-full items-center justify-center rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No session output yet. Start a run or ask Codex.
            </p>
          ) : (
            <div className="space-y-3">
              {streamItems.map((item) =>
                item.kind === "log" ? (
                  <div key={item.id} className="rounded-md border bg-muted/30 p-3">
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleTimeString()} · log
                    </p>
                    <pre className="whitespace-pre-wrap text-xs leading-5">{item.text}</pre>
                  </div>
                ) : (
                  <div key={item.id} className="flex justify-start">
                    <div
                      className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        item.role === "user"
                          ? "ml-auto bg-foreground text-background"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="mb-1 text-[11px] opacity-70">{item.role}</p>
                      {item.content}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <ChatInput
          onSend={onSendDebugMessage}
          onInterrupt={onInterruptDebugMessage}
          disabled={debugIsStreaming || Boolean(debugError)}
          providers={debugProviders}
          selection={debugSelection}
          onSelectionChange={onDebugSelectionChange}
        />
      </section>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Timeline</p>
          <p className="text-xs text-muted-foreground">Progress events for the selected session.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ExplorerLiveFeed items={feed} isRunning={isRunning} />
        </div>
      </section>
    </section>
  );
}

type Stats = ReturnType<typeof getExplorerStats>;

interface ConfigTabProps {
  domains: ExplorerDomainConfig[];
  stats: Stats;
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

function ConfigTab({
  domains,
  stats,
  addDomainInput,
  setAddDomainInput,
  onAddDomain,
  onToggleEnabled,
  onEditDomain,
  sorting,
  setSorting,
  includeAgentSuggestions,
  modelProviders,
  modelSelection,
  modelProvidersLoading,
  isDirty,
  busyAction,
  hasProfile,
  hasExplorerModel,
  onModelSelectionChange,
  onSave,
  onRun,
  onDiscard,
  onOpenSettings,
}: ConfigTabProps) {
  const columns = useMemo<ColumnDef<ExplorerDomainConfig>[]>(
    () => [
      {
        id: "enabled",
        header: "On",
        cell: ({ row }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <Switch
              size="sm"
              checked={row.original.enabled}
              onCheckedChange={(value) => onToggleEnabled(row.original, value)}
            />
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "domain",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Domain
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span
            className={row.original.enabled ? "font-medium" : "font-medium text-muted-foreground"}
          >
            {row.original.domain}
          </span>
        ),
      },
      {
        id: "queries",
        header: "Queries",
        cell: ({ row }) => {
          const count = row.original.queries.length;
          return (
            <span
              className={count === 0 ? "text-sm text-amber-500" : "text-sm text-muted-foreground"}
            >
              {count === 0 ? "none — add queries" : `${count}`}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "jobLimit",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Job limit
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.jobLimit}</span>
        ),
      },
      {
        accessorKey: "freshness",
        header: "Freshness",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {FRESHNESS_LABELS[row.original.freshness]}
          </span>
        ),
        enableSorting: false,
      },
    ],
    [onToggleEnabled],
  );

  const table = useReactTable({
    data: domains,
    columns,
    state: { sorting },
    onSortingChange: (updater) =>
      setSorting(typeof updater === "function" ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <section className="space-y-5 rounded-lg bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{stats.domainCount} domains</Badge>
          <Badge variant="outline">{stats.enabledCount} enabled</Badge>
          <Badge variant="outline">{stats.totalJobCap} job cap</Badge>
          <Badge variant={includeAgentSuggestions ? "secondary" : "outline"}>
            Agent suggestions {includeAgentSuggestions ? "on" : "off"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-muted/25 px-2 py-1">
            <span className="text-xs text-muted-foreground">Explorer model</span>
            <ProviderModelPicker
              providers={modelProviders}
              selection={modelSelection}
              disabled={modelProvidersLoading || busyAction === "explorer-discovery"}
              onSelectionChange={onModelSelectionChange}
            />
          </div>
          {isDirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={onDiscard}>
                Discard
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onSave}
                disabled={busyAction === "save-explorer"}
              >
                {busyAction === "save-explorer" ? "Saving..." : "Save"}
              </Button>
            </>
          ) : null}
          <Button
            onClick={onRun}
            size="sm"
            disabled={
              !hasProfile ||
              !hasExplorerModel ||
              stats.enabledCount === 0 ||
              busyAction === "save-explorer" ||
              busyAction === "explorer-discovery"
            }
          >
            <FileSearch className="size-4" />
            {busyAction === "explorer-discovery" ? "Exploring..." : "Run explorer"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenSettings}>
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={addDomainInput}
          onChange={(event) => setAddDomainInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddDomain();
            }
          }}
          placeholder="Add domain (e.g. seek.com.au) — Enter to add, comma-separate for multiple"
          className="flex-1 min-w-64"
        />
        <Button variant="outline" size="sm" onClick={onAddDomain} disabled={!addDomainInput.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <div className="rounded-lg bg-background shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => onEditDomain(row.original.domain)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-28 text-center">
                  <div className="space-y-2">
                    <p className="font-medium">No domains yet.</p>
                    <p className="text-sm text-muted-foreground">
                      Add a domain above to start configuring explorer scope.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

interface ExplorerFeedItem {
  id: string;
  createdAt: string;
  tone: "info" | "success" | "error";
  label: string;
  detail?: string;
}

interface ExplorerRunSession {
  thread: ChatThread;
  threadId: string;
  taskId: string | null;
}

function ExplorerLiveFeed({ items, isRunning }: { items: ExplorerFeedItem[]; isRunning: boolean }) {
  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Explorer runtime</p>
          <p className="text-xs text-muted-foreground">
            Live crawler steps and task status from server events.
          </p>
        </div>
        {isRunning ? (
          <Badge variant="secondary">Running</Badge>
        ) : (
          <Badge variant="outline">Idle</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No runtime events yet. Run explorer to see live progress.
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={
                    item.tone === "error"
                      ? "font-medium text-destructive"
                      : item.tone === "success"
                        ? "font-medium text-emerald-600"
                        : "font-medium"
                  }
                >
                  {item.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {item.detail ? <p className="mt-1 text-muted-foreground">{item.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface DomainConfigFormProps {
  config: ExplorerDomainConfig;
  suggestions: ExplorerQuerySuggestion[];
  onChange: (next: ExplorerDomainConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}

function DomainConfigForm({
  config,
  suggestions,
  onChange,
  onRemove,
  onClose,
}: DomainConfigFormProps) {
  const [queryDraft, setQueryDraft] = useState("");

  const selectedKeys = useMemo(
    () => new Set(config.queries.map((entry) => entry.toLowerCase())),
    [config.queries],
  );
  const unusedSuggestions = useMemo(
    () => suggestions.filter((entry) => !selectedKeys.has(entry.label.toLowerCase())),
    [suggestions, selectedKeys],
  );

  function handleAddDraft() {
    const next = addQueryToDomain(config, queryDraft);
    onChange(next);
    setQueryDraft("");
  }

  function handleAddSuggestion(label: string) {
    onChange(addQueryToDomain(config, label));
  }

  function handleRemoveQuery(query: string) {
    onChange(removeQueryFromDomain(config, query));
  }

  return (
    <>
      <SheetHeader className="border-b px-6 py-4">
        <SheetTitle className="truncate">{config.domain}</SheetTitle>
        <SheetDescription>
          Tune how the explorer crawls this domain for this project.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <label className="flex items-start gap-3 rounded-md border px-4 py-3">
          <Switch
            checked={config.enabled}
            onCheckedChange={(value) => onChange({ ...config, enabled: value })}
          />
          <div className="space-y-1">
            <div className="text-sm font-medium">Enabled</div>
            <p className="text-xs text-muted-foreground">
              Disabled domains are skipped when explorer runs.
            </p>
          </div>
        </label>

        <div className="space-y-2">
          <Label htmlFor="job-limit">Job limit</Label>
          <Input
            id="job-limit"
            type="number"
            min={1}
            max={500}
            value={config.jobLimit}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(value) && value > 0) {
                onChange({ ...config, jobLimit: value });
              }
            }}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Max jobs to collect per run from this domain.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Freshness</Label>
          <div className="flex flex-wrap gap-2">
            {FRESHNESS_OPTIONS.map((option) => {
              const active = config.freshness === option;
              return (
                <Button
                  key={option}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => onChange({ ...config, freshness: option })}
                >
                  {FRESHNESS_LABELS[option]}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Search queries</Label>
            <div className="mt-1 flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Each query is a phrase the crawler types into this domain's search (e.g. "Senior
                Frontend Engineer"). The explorer runs one search per query and collects matching
                jobs up to the job limit. Some boards split "What" and "Where", so short role
                queries plus separate location/remote queries are usually more reliable than one
                long combined phrase.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddDraft();
                }
              }}
              placeholder="Type a query and press Enter"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddDraft}
              disabled={!queryDraft.trim()}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>

          {config.queries.length > 0 ? (
            <div className="space-y-1.5">
              {config.queries.map((query) => (
                <div
                  key={query}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span className="truncate text-sm">{query}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => handleRemoveQuery(query)}
                    aria-label={`Remove query ${query}`}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No queries yet. This domain won't be searched until you add at least one.
            </p>
          )}

          {unusedSuggestions.length > 0 ? (
            <div className="space-y-2 rounded-md border-dashed border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">
                Suggestions from your profile
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unusedSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => handleAddSuggestion(suggestion.label)}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-foreground/30 hover:bg-accent/40"
                  >
                    <Plus className="size-3" />
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t px-6 py-4">
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive">
          <Trash2 className="size-4" />
          Remove
        </Button>
        <Button onClick={onClose}>Done</Button>
      </SheetFooter>
    </>
  );
}

interface ResultsTabProps {
  domains: ExplorerDomainConfig[];
  jobs: JobRecord[];
  matches: JobMatch[];
}

function ResultsTab({ domains, jobs, matches }: ResultsTabProps) {
  const [selectedDomain, setSelectedDomain] = useState<string | "all">("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [minScore, setMinScore] = useState(0);

  const matchByJobId = useMemo(() => {
    const lookup = new Map<string, JobMatch>();
    for (const match of matches) {
      lookup.set(match.jobId, match);
    }
    return lookup;
  }, [matches]);

  const jobsByDomain = useMemo(() => {
    const byDomain = new Map<string, JobRecord[]>();
    const other: JobRecord[] = [];

    for (const job of jobs) {
      const host = extractHost(job.url);
      const matchedDomain = domains.find((entry) =>
        host ? host.includes(entry.domain.toLowerCase()) : false,
      );
      if (matchedDomain) {
        const key = matchedDomain.domain;
        const current = byDomain.get(key) ?? [];
        current.push(job);
        byDomain.set(key, current);
      } else {
        other.push(job);
      }
    }

    return { byDomain, other };
  }, [jobs, domains]);

  const visibleJobs = useMemo(() => {
    let list: JobRecord[];
    if (selectedDomain === "all") {
      list = jobs;
    } else if (selectedDomain === "__other__") {
      list = jobsByDomain.other;
    } else {
      list = jobsByDomain.byDomain.get(selectedDomain) ?? [];
    }

    const keyword = keywordFilter.trim().toLowerCase();
    if (keyword) {
      list = list.filter((job) =>
        [job.title, job.company, job.location, job.summary]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      );
    }

    if (minScore > 0) {
      list = list.filter((job) => (matchByJobId.get(job.id)?.score ?? 0) >= minScore);
    }

    return list
      .slice()
      .sort(
        (left, right) =>
          (matchByJobId.get(right.id)?.score ?? 0) - (matchByJobId.get(left.id)?.score ?? 0),
      );
  }, [jobs, jobsByDomain, selectedDomain, keywordFilter, minScore, matchByJobId]);

  if (jobs.length === 0) {
    return (
      <section className="rounded-lg bg-card p-10 text-center shadow-sm">
        <FileSearch className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 font-medium">No results yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run the explorer from the Config tab to collect jobs.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg bg-card p-4 shadow-sm md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 border-border/50 md:border-r md:pr-3">
        <DomainRailButton
          label="All domains"
          count={jobs.length}
          active={selectedDomain === "all"}
          onSelect={() => setSelectedDomain("all")}
        />
        {domains.map((entry) => {
          const count = jobsByDomain.byDomain.get(entry.domain)?.length ?? 0;
          return (
            <DomainRailButton
              key={entry.domain}
              label={entry.domain}
              count={count}
              active={selectedDomain === entry.domain}
              onSelect={() => setSelectedDomain(entry.domain)}
            />
          );
        })}
        {jobsByDomain.other.length > 0 ? (
          <DomainRailButton
            label="Other"
            count={jobsByDomain.other.length}
            active={selectedDomain === "__other__"}
            onSelect={() => setSelectedDomain("__other__")}
          />
        ) : null}
      </aside>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={keywordFilter}
            onChange={(event) => setKeywordFilter(event.target.value)}
            placeholder="Filter by title, company, location..."
            className="min-w-64 flex-1"
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="min-score" className="text-xs text-muted-foreground">
              Min score
            </Label>
            <Input
              id="min-score"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={minScore}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value);
                setMinScore(Number.isFinite(value) ? value : 0);
              }}
              className="w-20"
            />
          </div>
          <Badge variant="outline">{visibleJobs.length} results</Badge>
        </div>

        {visibleJobs.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No jobs match the current filters.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleJobs.map((job) => (
              <JobResultCard key={job.id} job={job} match={matchByJobId.get(job.id)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DomainRailButton({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
      }`}
    >
      <span className="truncate">{label}</span>
      <Badge variant="outline" className="ml-2 shrink-0 text-xs">
        {count}
      </Badge>
    </button>
  );
}

function JobResultCard({ job, match }: { job: JobRecord; match?: JobMatch }) {
  return (
    <li className="rounded-md border bg-background p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{job.title}</h3>
            {match ? (
              <Badge variant={match.score >= 0.7 ? "default" : "secondary"} className="text-xs">
                {(match.score * 100).toFixed(0)}%
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{job.company}</span>
            <span>·</span>
            <span>{job.location}</span>
            {job.salary ? (
              <>
                <span>·</span>
                <span>{job.salary}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
          </div>
          {job.summary ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{job.summary}</p>
          ) : null}
          {match && (match.reasons.length > 0 || match.gaps.length > 0) ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {match.reasons.slice(0, 3).map((reason) => (
                <Badge key={reason} variant="secondary" className="text-xs">
                  {reason}
                </Badge>
              ))}
              {match.gaps.slice(0, 2).map((gap) => (
                <Badge key={gap} variant="outline" className="text-xs">
                  gap: {gap}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>
    </li>
  );
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildExplorerRunSessions(
  threads: ChatThread[],
  events: RuntimeEvent[],
): ExplorerRunSession[] {
  const runThreads = [...threads]
    .filter((thread) => thread.title.startsWith("Run "))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const startedRuns = events
    .filter((event) => event.type === "task.started")
    .flatMap((event) => {
      const payload = event.payload as Record<string, unknown>;
      const taskType = typeof payload.taskType === "string" ? payload.taskType : null;
      const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
      if (taskType !== "explorer_discovery" || !taskId) {
        return [];
      }
      return [{ taskId, createdAt: event.createdAt }] as const;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return runThreads.map((thread, index) => ({
    thread,
    threadId: thread.id,
    taskId: startedRuns[index]?.taskId ?? null,
  }));
}

function toExplorerFeed(events: RuntimeEvent[], taskId: string | null): ExplorerFeedItem[] {
  if (!taskId) {
    return [];
  }

  const filtered: ExplorerFeedItem[] = [];

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    const eventTaskId = typeof payload.taskId === "string" ? payload.taskId : null;
    if (eventTaskId !== taskId) {
      continue;
    }

    const taskType = typeof payload.taskType === "string" ? payload.taskType : null;
    const isExplorerTaskEvent =
      (event.type === "task.progress" && taskType === "explorer_discovery") ||
      ((event.type === "task.started" ||
        event.type === "task.completed" ||
        event.type === "task.failed") &&
        taskType === "explorer_discovery");

    if (!isExplorerTaskEvent && event.type !== "jobs.updated") {
      continue;
    }

    if (event.type === "task.started") {
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
        tone: "info",
        label: "Explorer run started",
      });
      continue;
    }

    if (event.type === "task.failed") {
      const detail = typeof payload.error === "string" ? payload.error : "Unknown task failure.";
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
        tone: "error",
        label: "Explorer run failed",
        detail,
      });
      continue;
    }

    if (event.type === "task.completed") {
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
        tone: "success",
        label: "Explorer run completed",
      });
      continue;
    }

    if (event.type === "jobs.updated") {
      const jobsCreated = typeof payload.jobsCreated === "number" ? payload.jobsCreated : 0;
      const domainsProcessed =
        typeof payload.domainsProcessed === "number" ? payload.domainsProcessed : 0;
      const queriesRun = typeof payload.queriesRun === "number" ? payload.queriesRun : 0;
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
        tone: "success",
        label: `Saved ${jobsCreated} jobs`,
        detail: `${domainsProcessed} domains, ${queriesRun} queries`,
      });
      continue;
    }

    if (event.type !== "task.progress") {
      continue;
    }

    const phase = typeof payload.phase === "string" ? payload.phase : "";
    const domain = typeof payload.domain === "string" ? payload.domain : "unknown domain";
    const query = typeof payload.query === "string" ? payload.query : "query";
    const currentQuery = typeof payload.currentQuery === "number" ? payload.currentQuery : 0;
    const totalQueries = typeof payload.totalQueries === "number" ? payload.totalQueries : 0;
    const jobsFound = typeof payload.jobsFound === "number" ? payload.jobsFound : null;
    const progressText =
      currentQuery > 0 && totalQueries > 0 ? `${currentQuery}/${totalQueries}` : "in progress";

    if (phase === "query_started") {
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
        tone: "info",
        label: `Searching ${domain}`,
        detail: `${progressText} · ${query}`,
      });
      continue;
    }

    if (phase === "query_finished") {
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
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
      const score = typeof payload.score === "number" ? payload.score : null;
      const scoreText = score !== null ? ` · score ${Math.round(score * 100)}` : "";
      filtered.push({
        id: event.id,
        createdAt: event.createdAt,
        tone: "success",
        label: `Saved ${title}`,
        detail: `${company} · ${domain}${scoreText}`,
      });
    }
  }

  return filtered.slice(0, 40).reverse();
}

function toExplorerRawLogs(events: RuntimeEvent[], taskId: string | null): ExplorerRawLogLine[] {
  if (!taskId) {
    return [];
  }

  const out: ExplorerRawLogLine[] = [];

  for (const event of events) {
    if (event.type !== "task.progress") {
      continue;
    }

    const payload = event.payload as Record<string, unknown>;
    const eventTaskId = typeof payload.taskId === "string" ? payload.taskId : null;
    const taskType = typeof payload.taskType === "string" ? payload.taskType : null;
    if (eventTaskId !== taskId || taskType !== "explorer_discovery") {
      continue;
    }

    const phase = typeof payload.phase === "string" ? payload.phase : "";
    const domain = typeof payload.domain === "string" ? payload.domain : "unknown-domain";
    const query = typeof payload.query === "string" ? payload.query : "query";
    const step = typeof payload.step === "number" ? payload.step : null;
    const model = typeof payload.model === "string" ? payload.model : "unknown-model";
    const effort = typeof payload.effort === "string" ? payload.effort : "unknown-effort";
    const retry = payload.retry === true ? " retry" : "";

    if (phase === "query_started") {
      out.push({
        id: event.id,
        createdAt: event.createdAt,
        text: `[query_started] ${domain} | ${query}\nmodel=${model} effort=${effort}`,
      });
      continue;
    }

    if (phase === "codex_raw") {
      const raw = typeof payload.raw === "string" ? payload.raw : "";
      if (!raw) continue;
      out.push({
        id: event.id,
        createdAt: event.createdAt,
        text: `[codex_raw${retry}] ${domain} | ${query} | step ${step ?? "?"}\n${raw}`,
      });
      continue;
    }

    if (phase === "crawl_step") {
      const action = typeof payload.action === "string" ? payload.action : "unknown_action";
      const ok = payload.ok === true ? "ok" : "fail";
      const result = typeof payload.result === "string" ? payload.result : "";
      const params = payload.params;
      const paramsText = params ? JSON.stringify(params) : "{}";
      out.push({
        id: event.id,
        createdAt: event.createdAt,
        text: `[crawl_step${retry}] ${domain} | ${query} | step ${step ?? "?"} | ${action} | ${ok}\nparams=${paramsText}\nresult=${result}`,
      });
    }
  }

  return out.slice(0, 120).reverse();
}
