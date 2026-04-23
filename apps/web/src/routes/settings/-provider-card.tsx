import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ProviderCardProps, ProviderSummary } from "./settings/-settings.types";

function getProviderSummary(input: {
  enabled: boolean;
  connection: import("@/lib/api").ConnectionStatus | null;
}): ProviderSummary {
  if (!input.enabled) {
    return {
      headline: "Disabled",
      detail: "Provider is disabled for new sessions.",
      dotClass: "bg-amber-400",
    };
  }

  if (!input.connection) {
    return {
      headline: "Checking status",
      detail: "Waiting for the server to report provider health.",
      dotClass: "bg-muted-foreground/60",
    };
  }

  if (input.connection.ok) {
    return {
      headline: "Available",
      detail: input.connection.message,
      dotClass: "bg-emerald-500",
    };
  }

  return {
    headline: "Unavailable",
    detail: input.connection.message,
    dotClass: "bg-red-500",
  };
}

export function ProviderCard({
  providerId,
  providerSettings,
  connection,
  isDirty,
  isSaving,
  onToggleEnabled,
  onUpdateSettings,
  onSave,
}: ProviderCardProps) {
  const settings = providerSettings?.[providerId];
  const enabled = settings?.enabled ?? true;
  const summary = getProviderSummary({ enabled, connection });

  const title = providerId === "codex" ? "Codex" : providerId === "claude" ? "Claude" : "OpenCode";

  return (
    <div className="relative overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border/50 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`inline-block size-2.5 rounded-full ${summary.dotClass}`} />
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
            </div>
            <p className="text-sm text-foreground/90">{summary.headline}</p>
            <p className="text-sm text-muted-foreground">{summary.detail}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {providerId === "codex" && (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Codex binary path</h4>
              <Input
                value={settings?.binaryPath ?? ""}
                onChange={(event) => onUpdateSettings({ binaryPath: event.target.value })}
                placeholder="codex"
              />
              <p className="text-xs text-muted-foreground">Path to the Codex binary</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Codex home path</h4>
              <Input
                value={settings?.homePath ?? ""}
                onChange={(event) => onUpdateSettings({ homePath: event.target.value })}
                placeholder="CODEX_HOME (optional)"
              />
              <p className="text-xs text-muted-foreground">
                Optional custom Codex home and config directory.
              </p>
            </div>
          </>
        )}

        {providerId === "opencode" && (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">OpenCode binary path</h4>
              <Input
                value={settings?.binaryPath ?? ""}
                onChange={(event) => onUpdateSettings({ binaryPath: event.target.value })}
                placeholder="opencode"
              />
              <p className="text-xs text-muted-foreground">Path to the OpenCode binary</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">OpenCode server URL</h4>
              <Input
                value={(settings as Record<string, string>)?.serverUrl ?? ""}
                onChange={(event) => onUpdateSettings({ serverUrl: event.target.value })}
                placeholder="http://127.0.0.1:4096"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to let OpenCode spawn locally when needed.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">OpenCode server password</h4>
              <Input
                value={(settings as Record<string, string>)?.serverPassword ?? ""}
                onChange={(event) => onUpdateSettings({ serverPassword: event.target.value })}
                placeholder="Server password (optional)"
              />
              <p className="text-xs text-muted-foreground">Stored in plain text on disk.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">OpenCode custom models</h4>
              <Input
                value={joinCsv((settings as Record<string, string[]>)?.customModels ?? [])}
                onChange={(event) =>
                  onUpdateSettings({ customModels: parseCsv(event.target.value) })
                }
                placeholder="openai/gpt-5, anthropic/claude-sonnet-4-5"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated `provider/model` slugs.
              </p>
            </div>
          </>
        )}

        {providerId === "claude" && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Claude binary path</h4>
            <Input
              value={settings?.binaryPath ?? ""}
              onChange={(event) => onUpdateSettings({ binaryPath: event.target.value })}
              placeholder="claude"
            />
            <p className="text-xs text-muted-foreground">Path to the Claude binary</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={!providerSettings || isSaving || !isDirty}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save {title} settings
          </Button>
        </div>
      </div>
    </div>
  );
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinCsv(value: string[]): string {
  return value.join(", ");
}
