import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ExplorerPresetId } from "@jobseeker/contracts";
import { ArrowUpDown, FileSearch, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import {
  type ExplorerDomainTarget,
  explorerPresets,
  getExplorerDomainTargets,
  getExplorerQuerySuggestions,
  normalizeExplorerDomains,
} from "@/lib/explorer";
import { latestDocument } from "@/lib/project";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeader } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";

export const Route = createFileRoute("/projects/$projectId/explorer")({
  component: ExplorerPage,
});

function ExplorerPage() {
  const { project } = useProject();
  const { busyAction, startTask, saveExplorer } = useJobseeker();

  const semanticProfile = latestDocument(project.documents, "semantic_profile");
  const savedDomains = useMemo(
    () => normalizeExplorerDomains(project.explorer.domains),
    [project.explorer.domains],
  );
  const savedPresetIds = project.explorer.presetIds;
  const savedIncludeAgentSuggestions = project.explorer.includeAgentSuggestions;

  const [configSheetOpen, setConfigSheetOpen] = useState(false);
  const [domainsInput, setDomainsInput] = useState(savedDomains.join("\n"));
  const [selectedPresets, setSelectedPresets] = useState<ExplorerPresetId[]>(savedPresetIds);
  const [includeAgentSuggestions, setIncludeAgentSuggestions] = useState(
    savedIncludeAgentSuggestions,
  );
  const [sorting, setSorting] = useState<SortingState>([{ id: "domain", desc: false }]);
  const [sourceSorting, setSourceSorting] = useState<SortingState>([{ id: "label", desc: false }]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState<"all" | "Australia" | "Global">("all");
  const shellHeader = useMemo(
    () => ({
      title: "Explorer",
      description: "Configure search scope and review the roles discovered for this project.",
    }),
    [],
  );

  useShellHeader(shellHeader);

  const parsedDomains = useMemo(() => normalizeExplorerDomains(domainsInput), [domainsInput]);
  const querySuggestions = useMemo(
    () => getExplorerQuerySuggestions(project.profile),
    [project.profile],
  );
  const domainTargets = useMemo(
    () => getExplorerDomainTargets(savedDomains, querySuggestions),
    [savedDomains, querySuggestions],
  );
  const filteredPresets = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();

    return explorerPresets.filter((preset) => {
      if (marketFilter !== "all" && preset.market !== marketFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        preset.label,
        preset.description,
        preset.market,
        preset.sourceFamilies.join(" "),
        preset.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [marketFilter, sourceQuery]);

  const columns = useMemo<ColumnDef<ExplorerDomainTarget>[]>(
    () => [
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
        cell: ({ row }) => <span className="font-medium">{row.original.domain}</span>,
      },
      {
        accessorKey: "queries",
        header: "Related queries",
        sortingFn: (left, right) => left.original.queries.length - right.original.queries.length,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.queries.slice(0, 4).map((query) => (
              <Badge key={query.id} variant="secondary">
                {query.label}
              </Badge>
            ))}
            {row.original.queries.length > 4 ? (
              <Badge variant="outline">+{row.original.queries.length - 4} more</Badge>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "queryCount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Query count
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        sortingFn: (left, right) => left.original.queries.length - right.original.queries.length,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.queries.length}</span>
        ),
      },
    ],
    [],
  );

  const sourceColumns = useMemo<ColumnDef<(typeof explorerPresets)[number]>[]>(
    () => [
      {
        id: "select",
        header: "Use",
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedPresets.includes(row.original.id)}
            onChange={() => togglePreset(row.original.id)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        accessorKey: "label",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Source
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.original.label}</span>
              {selectedPresets.includes(row.original.id) ? <Badge>Selected</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "market",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Market
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <Badge variant="outline">{row.original.market}</Badge>,
      },
      {
        accessorKey: "sourceFamilies",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Coverage
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        sortingFn: (left, right) =>
          left.original.sourceFamilies.length - right.original.sourceFamilies.length,
        cell: ({ row }) => (
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">
              {row.original.sourceFamilies.length} sources
            </span>
            <div className="flex flex-wrap gap-1.5">
              {row.original.sourceFamilies.map((source) => (
                <Badge key={source} variant="secondary">
                  {source}
                </Badge>
              ))}
            </div>
          </div>
        ),
      },
    ],
    [selectedPresets],
  );

  const table = useReactTable({
    data: domainTargets,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sourceTable = useReactTable({
    data: filteredPresets,
    columns: sourceColumns,
    state: { sorting: sourceSorting },
    onSortingChange: setSourceSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function togglePreset(presetId: ExplorerPresetId) {
    setSelectedPresets((current) =>
      current.includes(presetId)
        ? current.filter((entry) => entry !== presetId)
        : [...current, presetId],
    );
  }

  function resetConfigDraft() {
    setDomainsInput(savedDomains.join("\n"));
    setSelectedPresets(savedPresetIds);
    setIncludeAgentSuggestions(savedIncludeAgentSuggestions);
  }

  function handleConfigSheetChange(nextOpen: boolean) {
    if (nextOpen) {
      resetConfigDraft();
      setConfigSheetOpen(true);
      return;
    }

    setConfigSheetOpen(false);
    resetConfigDraft();
  }

  async function handleSaveConfig(closeAfterSave = false) {
    await saveExplorer(project.project.id, {
      domains: parsedDomains,
      presetIds: selectedPresets,
      includeAgentSuggestions,
    });

    if (closeAfterSave) {
      setConfigSheetOpen(false);
    }
  }

  async function handleRunExplorer() {
    await handleSaveConfig(false);

    await startTask(
      { projectId: project.project.id, type: "explorer_discovery" },
      "explorer-discovery",
    );
  }

  return (
    <>
      <section className="space-y-5 rounded-lg bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{domainTargets.length} domains</Badge>
            <Badge variant="outline">{querySuggestions.length} queries</Badge>
            <Badge variant="outline">
              {savedIncludeAgentSuggestions ? "Agent suggestions on" : "Agent suggestions off"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void handleRunExplorer()}
              size="sm"
              disabled={
                !semanticProfile ||
                busyAction === "save-explorer" ||
                busyAction === "explorer-discovery"
              }
            >
              <FileSearch className="size-4" />
              {busyAction === "explorer-discovery" ? "Exploring..." : "Run explorer"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleConfigSheetChange(true)}>
              <Settings className="size-4" />
            </Button>
          </div>
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
                  <TableRow key={row.id}>
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
                    <div className="space-y-3">
                      <p className="font-medium">No domains configured yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Click the settings icon to add domains and source packs for this project.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Sheet open={configSheetOpen} onOpenChange={handleConfigSheetChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col overflow-hidden p-0 sm:max-w-5xl"
        >
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>Source configuration</SheetTitle>
            <SheetDescription>
              Manage manual domains, source coverage, and whether the explorer can append visible
              sources on its own.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 overflow-y-auto px-6 pb-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label htmlFor="project-domains">Manual domains</Label>
                <Badge variant="outline">{parsedDomains.length} unique domains</Badge>
              </div>
              <Textarea
                id="project-domains"
                value={domainsInput}
                onChange={(event) => setDomainsInput(event.target.value)}
                placeholder={"seek.com.au\ngreenhouse.io\nlever.co"}
                className="min-h-44"
              />
              <p className="text-sm text-muted-foreground">
                Add one domain per line or separate them with commas. Duplicate entries are removed
                automatically.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="font-medium">Source list</h4>
                <p className="text-sm text-muted-foreground">
                  Filter and sort source packs, then select the ones that should expand discovery
                  coverage.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={sourceQuery}
                  onChange={(event) => setSourceQuery(event.target.value)}
                  placeholder="Filter sources..."
                  className="min-w-64 flex-1"
                />
                <select
                  value={marketFilter}
                  onChange={(event) =>
                    setMarketFilter(event.target.value as "all" | "Australia" | "Global")
                  }
                  className="flex h-9 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <option value="all">All markets</option>
                  <option value="Australia">Australia</option>
                  <option value="Global">Global</option>
                </select>
                <Badge variant="outline">{selectedPresets.length} selected</Badge>
              </div>

              <div className="rounded-lg bg-background shadow-sm">
                <Table>
                  <TableHeader>
                    {sourceTable.getHeaderGroups().map((headerGroup) => (
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
                    {sourceTable.getRowModel().rows.length > 0 ? (
                      sourceTable.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          data-state={selectedPresets.includes(row.original.id) && "selected"}
                          onClick={() => togglePreset(row.original.id)}
                          className="cursor-pointer"
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
                        <TableCell colSpan={sourceColumns.length} className="h-24 text-center">
                          No source packs match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-md bg-muted/30 px-4 py-3 text-sm shadow-sm">
              <input
                type="checkbox"
                checked={includeAgentSuggestions}
                onChange={(event) => setIncludeAgentSuggestions(event.target.checked)}
              />
              <span>Allow the agent to append extra visible job-board domains.</span>
            </label>
          </div>

          <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleConfigSheetChange(false)}>
              Close
            </Button>
            <Button
              onClick={() => void handleSaveConfig(true)}
              disabled={busyAction === "save-explorer" || busyAction === "explorer-discovery"}
            >
              {busyAction === "save-explorer" ? "Saving..." : "Save config"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
