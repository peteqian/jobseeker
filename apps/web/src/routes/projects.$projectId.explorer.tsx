import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileSearch, Plus, Square, X } from "lucide-react";
import type {
  ChatModelSelection,
  ExplorerDomainConfig,
  ExplorerSearchConfig,
} from "@jobseeker/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderModelPicker } from "@/components/chat/provider-model-picker";

import { appendThreadToCache } from "@/lib/chat-cache";
import { explorerThreadsQueryOptions, projectsListQueryOptions } from "@/lib/query-options";
import {
  createDomainConfig,
  getExplorerStats,
  getRoleSuggestions,
  parseDomainLines,
  removeDomainConfig,
  upsertDomainConfig,
} from "@/lib/explorer";
import { useModelChoice } from "@/hooks/use-model-choice";
import {
  useContinueLogin,
  useDeleteJob,
  useInterruptTask,
  useSaveExplorer,
  useStartTask,
} from "@/hooks/use-project-mutations";
import { useProjectEvents } from "@/hooks/use-project-events";
import { projectRouteId } from "@/lib/project-route";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProjectStore } from "@/stores/project-store";
import { createThread } from "@/rpc/chat-client";

import { ExplorerLiveFeed } from "./projects.$projectId.explorer/-explorer-live-feed";
import { ProfileSummaryCard } from "./projects.$projectId.explorer/-profile-summary-card";
import { ResultsTab } from "./projects.$projectId.explorer/-results-tab";
import { SearchConfig } from "./projects.$projectId.explorer/-search-config";
import {
  latestExplorerTaskId,
  toExplorerFeed,
} from "./projects.$projectId.explorer/-components/explorer-feed";

type ExplorerTab = "configure" | "results";

interface ExplorerSearch {
  tab?: ExplorerTab;
  job?: string;
}

const VALID_TABS: readonly ExplorerTab[] = ["configure", "results"];

export const Route = createFileRoute("/projects/$projectId/explorer")({
  validateSearch: (search: Record<string, unknown>): ExplorerSearch => {
    const tab = VALID_TABS.includes(search.tab as ExplorerTab)
      ? (search.tab as ExplorerTab)
      : undefined;
    const job = typeof search.job === "string" && search.job.length > 0 ? search.job : undefined;
    return { tab, job };
  },
  loader: async ({ context, params }) => {
    const projects = await context.queryClient.ensureQueryData(projectsListQueryOptions());
    const project = projects.find((entry) => entry.project.slug === params.projectId);
    if (!project) return;
    await context.queryClient.ensureQueryData(explorerThreadsQueryOptions(project.project.id));
  },
  component: ExplorerPage,
});

const EMPTY_DOMAINS: ExplorerDomainConfig[] = [];
const DEFAULT_SEARCH: ExplorerSearchConfig = {
  roles: [],
  freshness: "week",
  jobLimit: 25,
  runMode: "sequential",
};

function ExplorerPage() {
  const project = useProjectStore((state) => state.currentProject);
  const queryClient = useQueryClient();
  const projectId = project?.project.id ?? "";
  const events = useProjectEvents(projectId);

  const startTaskMutation = useStartTask();
  const interruptTaskMutation = useInterruptTask();
  const saveExplorerMutation = useSaveExplorer();
  const deleteJobMutation = useDeleteJob();
  const continueLoginMutation = useContinueLogin();

  const runningExplorerTask = useMemo(() => {
    const running =
      project?.tasks.filter(
        (task) => task.type === "explorer_discovery" && task.status === "running",
      ) ?? [];
    return [...running].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }, [project?.tasks]);
  const isExplorerRunning = Boolean(runningExplorerTask) || startTaskMutation.isPending;

  const {
    providers: explorerProviders,
    selection: explorerSelection,
    setSelection: setExplorerSelection,
    providersLoading: explorerProvidersLoading,
  } = useModelChoice(projectId, "explorer");

  const savedDomains = project?.explorer.domains ?? EMPTY_DOMAINS;
  const savedSearch = project?.explorer.search ?? DEFAULT_SEARCH;
  const savedIncludeAgentSuggestions = project?.explorer.includeAgentSuggestions ?? false;

  const [draftDomains, setDraftDomains] = useState<ExplorerDomainConfig[]>(savedDomains);
  const [draftSearch, setDraftSearch] = useState<ExplorerSearchConfig>(savedSearch);
  const [draftIncludeAgent, setDraftIncludeAgent] = useState(savedIncludeAgentSuggestions);
  const [addDomainInput, setAddDomainInput] = useState("");

  useEffect(() => setDraftDomains(savedDomains), [savedDomains]);
  useEffect(() => setDraftSearch(savedSearch), [savedSearch]);
  useEffect(
    () => setDraftIncludeAgent(savedIncludeAgentSuggestions),
    [savedIncludeAgentSuggestions],
  );

  const shellHeader = useMemo(
    () => ({
      title: "Explorer",
      description: "Configure a search, run the crawl, and review discovered roles.",
    }),
    [],
  );
  useShellHeaderMeta(shellHeader);

  const stats = useMemo(() => getExplorerStats(draftDomains), [draftDomains]);
  const roleSuggestions = useMemo(
    () => getRoleSuggestions(project?.profile ?? null),
    [project?.profile],
  );
  // The live banner and feed follow the running task; once it finishes we fall
  // back to the newest explorer task.started in the event stream so the last
  // run's activity stays visible.
  const activeRunTaskId = useMemo(
    () => runningExplorerTask?.id ?? latestExplorerTaskId(events),
    [runningExplorerTask?.id, events],
  );
  const liveFeed = useMemo(
    () => toExplorerFeed(events, activeRunTaskId),
    [events, activeRunTaskId],
  );

  // The run is paused on a sign-in wall when the latest progress event for the
  // active run is "awaiting_login". It clears as soon as the agent emits a
  // newer event (i.e. after the user continues and crawling resumes).
  const awaitingLogin = useMemo(() => {
    if (!activeRunTaskId) return null;
    let latest: Record<string, unknown> | null = null;
    for (const event of events) {
      if (event.type !== "task.progress") continue;
      const payload = event.payload as Record<string, unknown>;
      if (payload.taskId !== activeRunTaskId || payload.taskType !== "explorer_discovery") continue;
      latest = payload;
    }
    if (latest?.phase !== "awaiting_login") return null;
    return typeof latest.message === "string" ? latest.message : "Sign-in required.";
  }, [events, activeRunTaskId]);

  const explorerModelProviders = useMemo(
    () => explorerProviders.filter((provider) => provider.id === "codex"),
    [explorerProviders],
  );
  const fallbackExplorerSelection = useMemo(() => {
    const codex = explorerModelProviders.find((provider) => provider.available);
    const model = codex?.models[0];
    if (!codex || !model) return undefined;
    return {
      provider: codex.id,
      model: model.slug,
      effort: model.capabilities.defaultEffort,
    } satisfies ChatModelSelection;
  }, [explorerModelProviders]);
  const effectiveExplorerSelection =
    explorerSelection?.provider === "codex" ? explorerSelection : fallbackExplorerSelection;

  useEffect(() => {
    if (!fallbackExplorerSelection || explorerSelection?.provider === "codex") return;
    setExplorerSelection(fallbackExplorerSelection);
  }, [explorerSelection?.provider, fallbackExplorerSelection, setExplorerSelection]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(draftDomains) !== JSON.stringify(savedDomains) ||
      JSON.stringify(draftSearch) !== JSON.stringify(savedSearch) ||
      draftIncludeAgent !== savedIncludeAgentSuggestions,
    [
      draftDomains,
      draftSearch,
      draftIncludeAgent,
      savedDomains,
      savedSearch,
      savedIncludeAgentSuggestions,
    ],
  );

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab = search.tab ?? "configure";
  const selectedJobId = search.job ?? null;

  const handleTabChange = (next: string) => {
    const tab: ExplorerTab = VALID_TABS.includes(next as ExplorerTab)
      ? (next as ExplorerTab)
      : "configure";
    void navigate({
      search: (prev) => ({ ...prev, tab, job: tab === "results" ? prev.job : undefined }),
      replace: true,
    });
  };

  const handleSelectJob = (jobId: string | null) => {
    void navigate({ search: (prev) => ({ ...prev, job: jobId ?? undefined }) });
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
    if (additions.length > 0) setDraftDomains((current) => [...current, ...additions]);
    setAddDomainInput("");
  }

  async function persistDraft() {
    await saveExplorerMutation.mutateAsync({
      projectId,
      input: {
        domains: draftDomains,
        search: draftSearch,
        includeAgentSuggestions: draftIncludeAgent,
      },
    });
  }

  async function handleRunExplorer() {
    if (isDirty) await persistDraft();
    const runThread = await createThread(
      projectId,
      "explorer",
      `Run ${new Date().toLocaleString()}`,
    );
    appendThreadToCache(queryClient, projectId, "explorer", runThread);
    await startTaskMutation.mutateAsync({
      projectId,
      type: "explorer_discovery",
      modelSelection: effectiveExplorerSelection,
    });
  }

  async function handleStopExplorerRun() {
    if (!runningExplorerTask) return;
    await interruptTaskMutation.mutateAsync(runningExplorerTask.id);
  }

  const canRun =
    Boolean(project.profile) &&
    Boolean(effectiveExplorerSelection) &&
    stats.enabledCount > 0 &&
    draftSearch.roles.length > 0 &&
    !isExplorerRunning;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="configure">Configure & Run</TabsTrigger>
            <TabsTrigger value="results">
              Results
              {project.jobs.length > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {project.jobs.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <ProviderModelPicker
              providers={explorerModelProviders}
              selection={effectiveExplorerSelection}
              disabled={explorerProvidersLoading || isExplorerRunning}
              onSelectionChange={setExplorerSelection}
            />
            {isDirty && !isExplorerRunning ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void persistDraft()}
                disabled={saveExplorerMutation.isPending}
              >
                {saveExplorerMutation.isPending ? "Saving…" : "Save"}
              </Button>
            ) : null}
            {runningExplorerTask ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleStopExplorerRun()}
                disabled={interruptTaskMutation.isPending}
              >
                <Square className="size-4" />
                {interruptTaskMutation.isPending ? "Stopping…" : "Stop run"}
              </Button>
            ) : (
              <Button size="sm" onClick={() => void handleRunExplorer()} disabled={!canRun}>
                <FileSearch className="size-4" />
                {isExplorerRunning ? "Exploring…" : "Run explorer"}
              </Button>
            )}
          </div>
        </div>

        {awaitingLogin ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Sign-in required</p>
              <p className="truncate text-xs text-muted-foreground">{awaitingLogin}</p>
            </div>
            <Button
              size="sm"
              onClick={() => activeRunTaskId && continueLoginMutation.mutate(activeRunTaskId)}
              disabled={continueLoginMutation.isPending || !activeRunTaskId}
            >
              {continueLoginMutation.isPending ? "Continuing…" : "I've signed in — Continue"}
            </Button>
          </div>
        ) : null}

        <TabsContent value="configure" className="m-0 min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Search */}
            <section className="min-h-0 overflow-y-auto rounded-lg border bg-card p-5 shadow-sm">
              <SearchConfig
                search={draftSearch}
                onChange={setDraftSearch}
                roleSuggestions={roleSuggestions}
              />

              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Domains</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.enabledCount} of {stats.domainCount} enabled
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={addDomainInput}
                    onChange={(e) => setAddDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDomain();
                      }
                    }}
                    placeholder="Add domain (e.g. seek.com.au)"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddDomain}
                    disabled={!addDomainInput.trim()}
                  >
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
                {draftDomains.length > 0 ? (
                  <ul className="divide-y rounded-md border">
                    {draftDomains.map((domain) => (
                      <li key={domain.domain} className="flex items-center gap-3 px-3 py-2">
                        <Switch
                          checked={domain.enabled}
                          onCheckedChange={(value) =>
                            setDraftDomains((current) =>
                              upsertDomainConfig(current, { ...domain, enabled: value }),
                            )
                          }
                        />
                        <span
                          className={
                            domain.enabled
                              ? "flex-1 text-sm font-medium"
                              : "flex-1 text-sm font-medium text-muted-foreground"
                          }
                        >
                          {domain.domain}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftDomains((current) => removeDomainConfig(current, domain.domain))
                          }
                          aria-label={`Remove ${domain.domain}`}
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted"
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                    No domains yet. Add a job board above.
                  </p>
                )}
                <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Switch checked={draftIncludeAgent} onCheckedChange={setDraftIncludeAgent} />
                  Let the agent suggest extra job-board domains during a run
                </label>
              </div>
            </section>

            {/* Activity + profile — activity leads so the live run is the focus */}
            <section className="flex min-h-0 flex-col gap-4 overflow-y-auto">
              <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <p className="text-sm font-medium">Activity</p>
                  {isExplorerRunning ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                      Running
                    </span>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <ExplorerLiveFeed items={liveFeed} isRunning={isExplorerRunning} />
                </div>
              </div>
              <ProfileSummaryCard projectSlug={projectRouteId(project)} profile={project.profile} />
            </section>
          </div>
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
            onDeleteJob={(pid, jobId) =>
              deleteJobMutation.mutateAsync({ projectId: pid, jobId }).then(() => undefined)
            }
            onGenerate={(jobId, type) =>
              void startTaskMutation.mutateAsync({ projectId, type, jobId })
            }
            onApply={(job) =>
              void startTaskMutation.mutateAsync({
                projectId,
                type: "apply_job",
                input: job.url,
                jobId: job.id,
                modelSelection: effectiveExplorerSelection,
              })
            }
            busyAction={isExplorerRunning ? "explorer-discovery" : null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
