import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { projectsListQueryOptions } from "@/lib/query-options";
import { useQuery } from "@tanstack/react-query";
import type { ProjectDocument, ProjectDocumentKind } from "@jobseeker/contracts";

interface DocumentRow {
  document: ProjectDocument;
  projectTitle: string;
}

const documentKindLabels: Record<ProjectDocumentKind, string> = {
  resume_source: "Resume Source",
  extracted_text: "Extracted Text",
  tailored_resume: "Tailored Resume",
};

const documentKindOrder: ProjectDocumentKind[] = ["resume_source", "tailored_resume"];

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
});

const DOCUMENTS_HEADER = {
  title: "Documents",
  description: "Review source resumes, profiles, and tailored resume variants across projects.",
};

function DocumentsPage() {
  useShellHeaderMeta(DOCUMENTS_HEADER);
  const { data: projects = [] } = useQuery(projectsListQueryOptions());
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const data = useMemo<DocumentRow[]>(
    () =>
      projects
        .flatMap((project) =>
          project.documents
            .filter((document) => document.kind !== "extracted_text")
            .map((document) => ({
              document,
              projectTitle: project.project.title,
            })),
        )
        .sort((left, right) => {
          const kindDiff =
            documentKindOrder.indexOf(left.document.kind) -
            documentKindOrder.indexOf(right.document.kind);
          if (kindDiff !== 0) return kindDiff;
          return right.document.createdAt.localeCompare(left.document.createdAt);
        }),
    [projects],
  );

  const columns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "document.name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.document.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "projectTitle",
        header: "Project",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.projectTitle}</span>
        ),
      },
      {
        id: "kind",
        accessorKey: "document.kind",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">{documentKindLabels[row.original.document.kind]}</Badge>
        ),
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
      },
      {
        id: "createdAt",
        accessorKey: "document.createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.document.createdAt).toLocaleString()}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const selectedRow = table.getSelectedRowModel().rows[0]?.original;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,480px)]">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by name..."
              value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
              className="pl-9"
            />
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
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => {
                      row.toggleSelected(true);
                      table
                        .getRowModel()
                        .rows.filter((r) => r.id !== row.id)
                        .forEach((r) => r.toggleSelected(false));
                    }}
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
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No documents found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} document(s) selected.
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg bg-card p-6 shadow-sm">
        {selectedRow ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight">{selectedRow.document.name}</h2>
              <Badge variant="outline">{documentKindLabels[selectedRow.document.kind]}</Badge>
              <Badge variant="outline">{selectedRow.projectTitle}</Badge>
            </div>
            <Textarea
              readOnly
              value={selectedRow.document.content ?? "Preview unavailable for this document."}
              className="min-h-[38rem] font-mono text-xs"
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Select a document from the table to preview it.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
