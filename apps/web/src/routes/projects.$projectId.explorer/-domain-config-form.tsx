import { useMemo, useState } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetFooter, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { addQueryToDomain, removeQueryFromDomain, FRESHNESS_LABELS } from "@/lib/explorer";
import type { DomainConfigFormProps } from "./projects.$projectId.explorer/explorer.types";

const FRESHNESS_OPTIONS: import("@jobseeker/contracts").ExplorerFreshness[] = [
  "24h",
  "week",
  "month",
  "any",
];

export function DomainConfigForm({
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
