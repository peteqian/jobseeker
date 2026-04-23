import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, FileSearch, Plus, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderModelPicker } from "@/components/chat/provider-model-picker";
import { FRESHNESS_LABELS } from "@/lib/explorer";
import { ChatInput } from "@/components/chat/chat-input";
import { ExplorerLiveFeed } from "./-explorer-live-feed";
import type { ConfigureRunTabProps } from "./projects.$projectId.explorer/-explorer.types";

function buildSessionStreamItems(
  messages: import("@jobseeker/contracts").ChatMessage[],
  logs: import("./projects.$projectId.explorer/explorer.types").ExplorerRawLogLine[],
  streamingContent: string,
): import("./projects.$projectId.explorer/explorer.types").SessionStreamItem[] {
  const items: import("./explorer.types").SessionStreamItem[] = [
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

export function ConfigureRunTab({
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
}: ConfigureRunTabProps) {
  const columns = useMemo<ColumnDef<import("@jobseeker/contracts").ExplorerDomainConfig>[]>(
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

  const streamItems = useMemo(
    () => buildSessionStreamItems(debugMessages, logs, debugStreamingContent),
    [debugMessages, logs, debugStreamingContent],
  );

  return (
    <section className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,0.5fr)]">
      {/* Left: Configuration */}
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Configuration</p>
          <p className="text-xs text-muted-foreground">Configure search domains and queries.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
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
            <Button
              variant="outline"
              size="sm"
              onClick={onAddDomain}
              disabled={!addDomainInput.trim()}
            >
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
        </div>
      </section>

      {/* Right: Run Monitor */}
      <section className="flex min-h-0 min-w-0 flex-col gap-4">
        {/* Timeline */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Timeline</p>
            <p className="text-xs text-muted-foreground">
              Progress events for the selected session.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ExplorerLiveFeed items={feed} isRunning={isRunning} />
          </div>
        </section>

        {/* Session Stream */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
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

        {/* Session History */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Run history</p>
            <p className="text-xs text-muted-foreground">Each run creates a new Codex session.</p>
          </div>
          <div className="min-h-0 max-h-48 overflow-y-auto p-3">
            {sessions.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                No sessions yet. Run Explorer to start one.
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
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
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </section>
  );
}
