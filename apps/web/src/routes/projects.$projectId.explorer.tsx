import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ChatModelSelection, ChatThread, ExplorerDomainConfig } from "@jobseeker/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { appendThreadToCache } from "@/lib/chat-cache";
import { explorerThreadsQueryOptions, projectsListQueryOptions } from "@/lib/query-options";
import {
  getExplorerQuerySuggestions,
  getExplorerStats,
  parseDomainLines,
  createDomainConfig,
  removeDomainConfig,
  upsertDomainConfig,
} from "@/lib/explorer";
import { useChat } from "@/hooks/use-chat";
import { useModelChoice } from "@/hooks/use-model-choice";
import { useDeleteJob, useSaveExplorer, useStartTask } from "@/hooks/use-project-mutations";
import { useProjectEvents } from "@/hooks/use-project-events";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProjectStore } from "@/stores/project-store";
import { createThread } from "@/rpc/chat-client";

import { ConfigureRunTab } from "./projects.$projectId.explorer/-configure-run-tab";
import { DomainConfigForm } from "./projects.$projectId.explorer/-domain-config-form";
import { ResultsTab } from "./projects.$projectId.explorer/-results-tab";
import type {
  ExplorerRunSession,
  ExplorerRawLogLine,
  ExplorerFeedItem,
} from "./projects.$projectId.explorer/-explorer.types";

interface ExplorerSearch {
  tab?: "config" | "results";
  job?: string;
}

export const Route = createFileRoute("/projects/$projectId/explorer")({
  validateSearch: (search: Record<string, unknown>): ExplorerSearch => {
    const tab =
      search.tab === "results" ? "results" : search.tab === "config" ? "config" : undefined;
    const job = typeof search.job === "string" && search.job.length > 0 ? search.job : undefined;
    return { tab, job };
  },
  loader: async ({ context, params }) => {
    const projects = await context.queryClient.ensureQueryData(projectsListQueryOptions());
    const project = projects.find((entry) => entry.project.slug === params.projectId);

    if (!project) {
      return;
    }

    await context.queryClient.ensureQueryData(explorerThreadsQueryOptions(project.project.id));
  },
  component: ExplorerPage,
});

const EMPTY_THREADS: ChatThread[] = [];
const EMPTY_DOMAINS: ExplorerDomainConfig[] = [];

function ExplorerPage() {
  const project = useProjectStore((state) => state.currentProject);
  const queryClient = useQueryClient();
  const projectId = project?.project.id ?? "";
  const events = useProjectEvents(projectId);

  const startTaskMutation = useStartTask();
  const saveExplorerMutation = useSaveExplorer();
  const deleteJobMutation = useDeleteJob();

  const busyAction = startTaskMutation.isPending
    ? "explorer-discovery"
    : saveExplorerMutation.isPending
      ? "save-explorer"
      : deleteJobMutation.isPending
        ? "delete-job"
        : null;
  const {
    providers: explorerProviders,
    selection: explorerSelection,
    setSelection: setExplorerSelection,
    providersLoading: explorerProvidersLoading,
  } = useModelChoice(projectId, "explorer");
  const hasProfile = Boolean(project?.profile);
  const savedDomains = project?.explorer.domains ?? EMPTY_DOMAINS;
  const savedIncludeAgentSuggestions = project?.explorer.includeAgentSuggestions ?? false;
  const threads = useQuery(explorerThreadsQueryOptions(projectId)).data ?? EMPTY_THREADS;

  const [draftDomains, setDraftDomains] = useState<ExplorerDomainConfig[]>(savedDomains);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draftIncludeAgent, setDraftIncludeAgent] = useState(savedIncludeAgentSuggestions);
  const [addDomainInput, setAddDomainInput] = useState("");
  const [sorting, setSorting] = useState<import("@tanstack/react-table").SortingState>([
    { id: "domain", desc: false },
  ]);
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setDraftDomains(savedDomains);
  }, [savedDomains]);

  useEffect(() => {
    setDraftIncludeAgent(savedIncludeAgentSuggestions);
  }, [savedIncludeAgentSuggestions]);

  useEffect(() => {
    const runThreads = threads.filter((thread) => thread.title.startsWith("Run "));
    const latestRun = [...runThreads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
    setActiveThreadId((current) => current ?? latestRun?.id ?? threads[0]?.id ?? null);
  }, [threads]);

  const shellHeader = useMemo(
    () => ({
      title: "Explorer",
      description: "Configure search scope and review the roles discovered for this project.",
    }),
    [],
  );
  useShellHeaderMeta(shellHeader);

  const querySuggestions = useMemo(
    () => getExplorerQuerySuggestions(project?.profile ?? null),
    [project?.profile],
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

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab = search.tab ?? "config";
  const selectedJobId = search.job ?? null;

  const handleTabChange = (next: string) => {
    const tab = next === "results" ? "results" : "config";
    void navigate({
      search: (prev) => ({ ...prev, tab, job: tab === "results" ? prev.job : undefined }),
      replace: true,
    });
  };

  const handleSelectJob = (jobId: string | null) => {
    void navigate({
      search: (prev) => ({ ...prev, job: jobId ?? undefined }),
    });
  };

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

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
    await saveExplorerMutation.mutateAsync({
      projectId,
      input: {
        domains: draftDomains,
        includeAgentSuggestions: draftIncludeAgent,
      },
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
    appendThreadToCache(queryClient, projectId, "explorer", runThread);
    setActiveThreadId(runThread.id);

    await startTaskMutation.mutateAsync({
      projectId,
      type: "explorer_discovery",
      modelSelection: effectiveExplorerSelection,
    });
  }

  function resetDraftFromSaved() {
    setDraftDomains(savedDomains);
    setDraftIncludeAgent(savedIncludeAgentSuggestions);
  }

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="config">Configure & Run</TabsTrigger>
            <TabsTrigger value="results">
              Results
              {project.jobs.length > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {project.jobs.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="config" className="m-0 min-h-0 flex-1 overflow-hidden">
          <ConfigureRunTab
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

        <TabsContent value="results" className="m-0 min-h-0 flex-1 overflow-hidden">
          <ResultsTab
            projectId={projectId}
            domains={savedDomains}
            jobs={project.jobs}
            matches={project.jobMatches}
            documents={project.documents}
            selectedJobId={selectedJobId}
            onSelectJob={handleSelectJob}
            onDeleteJob={(projectId, jobId) =>
              void deleteJobMutation.mutateAsync({ projectId, jobId })
            }
            onGenerate={(jobId, type) =>
              void startTaskMutation.mutateAsync({
                projectId,
                type,
                jobId,
              })
            }
            busyAction={busyAction}
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

function buildExplorerRunSessions(
  threads: ChatThread[],
  events: import("@jobseeker/contracts").RuntimeEvent[],
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

function toExplorerFeed(
  events: import("@jobseeker/contracts").RuntimeEvent[],
  taskId: string | null,
): ExplorerFeedItem[] {
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

function toExplorerRawLogs(
  events: import("@jobseeker/contracts").RuntimeEvent[],
  taskId: string | null,
): ExplorerRawLogLine[] {
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
