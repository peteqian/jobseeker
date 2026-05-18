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
import type { ConfigTabProps } from "./projects.$projectId.explorer/-explorer.types";

export function ConfigTab({
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
