import { useState } from "react";
import { Briefcase, MapPin, X } from "lucide-react";
import type {
  ExplorerFreshness,
  ExplorerRunMode,
  ExplorerSearchConfig,
  RemotePreference,
} from "@jobseeker/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { FRESHNESS_LABELS } from "@/lib/explorer";

interface SearchConfigProps {
  search: ExplorerSearchConfig;
  onChange: (next: ExplorerSearchConfig) => void;
  roleSuggestions: string[];
}

const FRESHNESS_OPTIONS: ExplorerFreshness[] = ["24h", "week", "month", "any"];
const ARRANGEMENT_OPTIONS: { value: RemotePreference | "any"; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "no", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "full", label: "Remote" },
];
const RUN_MODE_OPTIONS: { value: ExplorerRunMode; label: string }[] = [
  { value: "sequential", label: "Sequential" },
  { value: "parallel", label: "Parallel" },
];

/**
 * The one shared search set for a run: roles drive the per-domain queries;
 * location, work arrangement, freshness and job limit apply across every
 * enabled domain. Fully controlled — the route owns the draft.
 */
export function SearchConfig({ search, onChange, roleSuggestions }: SearchConfigProps) {
  const [roleDraft, setRoleDraft] = useState("");

  const addRole = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (search.roles.some((r) => r.toLowerCase() === value.toLowerCase())) return;
    onChange({ ...search, roles: [...search.roles, value] });
  };
  const removeRole = (role: string) => {
    onChange({ ...search, roles: search.roles.filter((r) => r !== role) });
  };

  const unusedSuggestions = roleSuggestions.filter(
    (s) => !search.roles.some((r) => r.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Roles */}
      <div className="space-y-2">
        {search.roles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {search.roles.map((role) => (
              <Badge key={role} variant="secondary" className="gap-1 pr-1 font-normal">
                {role}
                <button
                  type="button"
                  onClick={() => removeRole(role)}
                  aria-label={`Remove ${role}`}
                  className="rounded-sm p-0.5 hover:bg-background/60"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <InputGroup>
          <InputGroupAddon>
            <Briefcase />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Add a role"
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRole(roleDraft);
                setRoleDraft("");
              }
            }}
            placeholder="Add a role (e.g. Senior Frontend Engineer) — Enter to add"
          />
        </InputGroup>
        {unusedSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {unusedSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addRole(suggestion)}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Location */}
      <div className="space-y-2">
        <InputGroup>
          <InputGroupAddon>
            <MapPin />
          </InputGroupAddon>
          <InputGroupInput
            id="search-location"
            aria-label="Location"
            value={search.locationText ?? ""}
            onChange={(e) => onChange({ ...search, locationText: e.target.value || undefined })}
            placeholder="Location — e.g. Sydney NSW"
          />
        </InputGroup>
      </div>

      {/* Work arrangement */}
      <div className="space-y-2">
        <Label>Work arrangement</Label>
        <div className="flex flex-wrap gap-1.5">
          {ARRANGEMENT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={(search.remotePreference ?? "any") === option.value ? "default" : "outline"}
              onClick={() =>
                onChange({
                  ...search,
                  remotePreference: option.value === "any" ? undefined : option.value,
                })
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Freshness + job limit */}
      <div className="flex flex-wrap gap-6">
        <div className="space-y-2">
          <Label>Freshness</Label>
          <div className="flex flex-wrap gap-1.5">
            {FRESHNESS_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={search.freshness === option ? "default" : "outline"}
                onClick={() => onChange({ ...search, freshness: option })}
              >
                {FRESHNESS_LABELS[option]}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="search-job-limit">Job limit</Label>
          <Input
            id="search-job-limit"
            type="number"
            min={1}
            max={200}
            value={search.jobLimit}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              onChange({ ...search, jobLimit: Number.isFinite(next) ? next : search.jobLimit });
            }}
            className="w-28"
          />
        </div>
      </div>

      {/* Run mode: sequential opens one browser at a time; parallel fans out. */}
      <div className="space-y-2">
        <Label>Run mode</Label>
        <div className="flex flex-wrap gap-1.5">
          {RUN_MODE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={(search.runMode ?? "sequential") === option.value ? "default" : "outline"}
              onClick={() => onChange({ ...search, runMode: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Sequential runs one browser at a time. Parallel is faster but opens several browsers at
          once.
        </p>
      </div>
    </div>
  );
}
