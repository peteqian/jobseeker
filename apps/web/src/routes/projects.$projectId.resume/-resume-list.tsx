import { FileText, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResumeListProps } from "./projects.$projectId.resume/-resume.types";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function ResumeList({
  versions,
  selectedVersion,
  isBusy,
  onSelect,
  onActivate,
  onDelete,
  onAdd,
}: ResumeListProps) {
  return (
    <section className="flex min-h-0 flex-col bg-muted/20">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold tracking-tight">Resume list</h3>
            <p className="text-sm text-muted-foreground">
              Select a version to inspect or activate it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{versions.length} saved</Badge>
            <Button size="sm" onClick={onAdd}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {versions.length ? (
          <div className="space-y-2">
            {versions.map((version) => {
              const isSelected = version.document.id === selectedVersion?.document.id;

              return (
                <div
                  key={version.document.id}
                  className={cn(
                    "rounded-lg px-3 py-3 transition-colors",
                    isSelected ? "bg-card shadow-sm" : "hover:bg-accent/40",
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(version.document.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }

                      event.preventDefault();
                      onSelect(version.document.id);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <p className="truncate font-medium">{version.document.name}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {version.isActive ? (
                            <Badge variant="default" className="gap-1">
                              Active resume
                            </Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                          <span>{formatDate(version.uploadedAt)}</span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="self-start"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDelete(version);
                        }}
                        disabled={isBusy}
                        aria-label={`Delete ${version.document.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {version.isActive
                        ? "Used for matching and tailoring"
                        : "Available to activate"}
                    </p>
                    <Button
                      variant={version.isActive ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => onActivate(version)}
                      disabled={isBusy}
                    >
                      {version.isActive ? "Active resume" : "Set active"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-3xl bg-background/70 px-6 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <h4 className="font-medium">No resumes saved yet</h4>
              <p className="text-sm leading-6 text-muted-foreground">
                Add a pasted resume or upload a file to create the first version.
              </p>
            </div>
            <Button onClick={onAdd}>
              <Plus className="size-4" />
              Add resume
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
