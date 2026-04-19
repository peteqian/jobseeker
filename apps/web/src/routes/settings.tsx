import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useShellHeader } from "@/providers/shell-header-context";
import { useTheme } from "@/components/theme-provider";
import {
  type ConnectionStatus,
  type ProviderSettings,
  getConnections,
  getProviderSettings,
  updateProviderSettings,
} from "@/lib/api";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const SETTINGS_HEADER = {
  title: "Settings",
  description: "Check provider connections and configure your environment.",
};

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function StatusBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <Badge variant="success" className="gap-1.5">
        <CheckCircle2 className="size-3.5" />
        Connected
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1.5">
      <XCircle className="size-3.5" />
      Not connected
    </Badge>
  );
}

function ConnectionRow({ connection }: { connection: ConnectionStatus }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{connection.name}</h3>
          <p className="text-sm text-muted-foreground">{connection.message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <StatusBadge ok={connection.ok} />
        </div>
      </div>
    </div>
  );
}

type ProviderId = "codex" | "claude" | "opencode";

function getProviderSummary(input: { enabled: boolean; connection: ConnectionStatus | null }) {
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

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinCsv(value: string[]): string {
  return value.join(", ");
}

function isProviderDirty(
  providerSettings: ProviderSettings | null,
  savedProviderSettings: ProviderSettings | null,
  providerId: ProviderId,
): boolean {
  if (!providerSettings || !savedProviderSettings) {
    return false;
  }

  return (
    JSON.stringify(providerSettings[providerId]) !==
    JSON.stringify(savedProviderSettings[providerId])
  );
}

function SettingsPage() {
  useShellHeader(SETTINGS_HEADER);
  const queryClient = useQueryClient();
  const { theme, setTheme, routerDevtools, setRouterDevtools } = useTheme();
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [savedProviderSettings, setSavedProviderSettings] = useState<ProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProviderId, setSavingProviderId] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [connectionResult, settingsResult] = await Promise.all([
        getConnections(),
        getProviderSettings(),
      ]);
      setConnections(connectionResult);
      setProviderSettings(settingsResult);
      setSavedProviderSettings(settingsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check connections");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProvider = useCallback(
    async (providerId: ProviderId) => {
      if (!providerSettings) return;
      setSavingProviderId(providerId);
      setError(null);

      const patch =
        providerId === "codex"
          ? { codex: providerSettings.codex }
          : providerId === "claude"
            ? { claude: providerSettings.claude }
            : { opencode: providerSettings.opencode };

      try {
        const saved = await updateProviderSettings(patch);
        setProviderSettings(saved);
        setSavedProviderSettings(saved);
        await queryClient.invalidateQueries({ queryKey: ["chat", "providers"] });
        const result = await getConnections();
        setConnections(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save provider settings");
      } finally {
        setSavingProviderId(null);
      }
    },
    [providerSettings, queryClient],
  );

  const codexConnection = connections.find((connection) => connection.id === "codex") ?? null;
  const claudeConnection = connections.find((connection) => connection.id === "claude") ?? null;
  const opencodeConnection = connections.find((connection) => connection.id === "opencode") ?? null;

  const codexDirty = isProviderDirty(providerSettings, savedProviderSettings, "codex");
  const claudeDirty = isProviderDirty(providerSettings, savedProviderSettings, "claude");
  const opencodeDirty = isProviderDirty(providerSettings, savedProviderSettings, "opencode");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6 sm:p-8">
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-8 overflow-y-auto pr-2">
        <section className="space-y-2.5">
          <div className="px-1">
            <h2 className="text-sm font-semibold tracking-tight">System</h2>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm">
            <div className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
                  <p className="text-sm text-muted-foreground">Choose how the app looks.</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTheme(opt.value)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        theme === opt.value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {import.meta.env.DEV ? (
              <div className="border-t border-border/50 px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Router Devtools</h3>
                    <p className="text-sm text-muted-foreground">Show the TanStack Router panel.</p>
                  </div>
                  <Switch checked={routerDevtools} onCheckedChange={setRouterDevtools} />
                </div>
              </div>
            ) : null}

            <div className="border-t border-border/50 px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Connections</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => void refresh()}
                  className="text-muted-foreground"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>

            {loading && connections.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="px-5 py-8 text-center text-sm text-destructive">{error}</div>
            ) : (
              connections.map((c) => <ConnectionRow key={c.id} connection={c} />)
            )}
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="px-1">
            <h2 className="text-sm font-semibold tracking-tight">Providers</h2>
          </div>

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm">
              <div className="border-b border-border/50 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2.5 rounded-full ${
                          getProviderSummary({
                            enabled: providerSettings?.codex.enabled ?? true,
                            connection: codexConnection,
                          }).dotClass
                        }`}
                      />
                      <h3 className="text-base font-semibold text-foreground">Codex</h3>
                    </div>
                    <p className="text-sm text-foreground/90">
                      {
                        getProviderSummary({
                          enabled: providerSettings?.codex.enabled ?? true,
                          connection: codexConnection,
                        }).headline
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        getProviderSummary({
                          enabled: providerSettings?.codex.enabled ?? true,
                          connection: codexConnection,
                        }).detail
                      }
                    </p>
                  </div>
                  <Switch
                    checked={providerSettings?.codex.enabled ?? true}
                    onCheckedChange={(enabled) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              codex: { ...current.codex, enabled },
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Codex binary path</h4>
                  <Input
                    value={providerSettings?.codex.binaryPath ?? ""}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              codex: { ...current.codex, binaryPath: event.target.value },
                            }
                          : current,
                      )
                    }
                    placeholder="codex"
                  />
                  <p className="text-xs text-muted-foreground">Path to the Codex binary</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Codex home path</h4>
                  <Input
                    value={providerSettings?.codex.homePath ?? ""}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              codex: { ...current.codex, homePath: event.target.value },
                            }
                          : current,
                      )
                    }
                    placeholder="CODEX_HOME (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional custom Codex home and config directory.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => void saveProvider("codex")}
                    disabled={!providerSettings || savingProviderId === "codex" || !codexDirty}
                  >
                    {savingProviderId === "codex" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Save Codex settings
                  </Button>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm">
              <div className="border-b border-border/50 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2.5 rounded-full ${
                          getProviderSummary({
                            enabled: providerSettings?.opencode.enabled ?? true,
                            connection: opencodeConnection,
                          }).dotClass
                        }`}
                      />
                      <h3 className="text-base font-semibold text-foreground">OpenCode</h3>
                    </div>
                    <p className="text-sm text-foreground/90">
                      {
                        getProviderSummary({
                          enabled: providerSettings?.opencode.enabled ?? true,
                          connection: opencodeConnection,
                        }).headline
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        getProviderSummary({
                          enabled: providerSettings?.opencode.enabled ?? true,
                          connection: opencodeConnection,
                        }).detail
                      }
                    </p>
                  </div>
                  <Switch
                    checked={providerSettings?.opencode.enabled ?? true}
                    onCheckedChange={(enabled) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              opencode: { ...current.opencode, enabled },
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">OpenCode binary path</h4>
                  <Input
                    value={providerSettings?.opencode.binaryPath ?? ""}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              opencode: { ...current.opencode, binaryPath: event.target.value },
                            }
                          : current,
                      )
                    }
                    placeholder="opencode"
                  />
                  <p className="text-xs text-muted-foreground">Path to the OpenCode binary</p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">OpenCode server URL</h4>
                  <Input
                    value={providerSettings?.opencode.serverUrl ?? ""}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              opencode: { ...current.opencode, serverUrl: event.target.value },
                            }
                          : current,
                      )
                    }
                    placeholder="http://127.0.0.1:4096"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to let OpenCode spawn locally when needed.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">OpenCode server password</h4>
                  <Input
                    value={providerSettings?.opencode.serverPassword ?? ""}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              opencode: { ...current.opencode, serverPassword: event.target.value },
                            }
                          : current,
                      )
                    }
                    placeholder="Server password (optional)"
                  />
                  <p className="text-xs text-muted-foreground">Stored in plain text on disk.</p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">OpenCode custom models</h4>
                  <Input
                    value={joinCsv(providerSettings?.opencode.customModels ?? [])}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              opencode: {
                                ...current.opencode,
                                customModels: parseCsv(event.target.value),
                              },
                            }
                          : current,
                      )
                    }
                    placeholder="openai/gpt-5, anthropic/claude-sonnet-4-5"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated `provider/model` slugs.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => void saveProvider("opencode")}
                    disabled={
                      !providerSettings || savingProviderId === "opencode" || !opencodeDirty
                    }
                  >
                    {savingProviderId === "opencode" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Save OpenCode settings
                  </Button>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm">
              <div className="border-b border-border/50 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2.5 rounded-full ${
                          getProviderSummary({
                            enabled: providerSettings?.claude.enabled ?? true,
                            connection: claudeConnection,
                          }).dotClass
                        }`}
                      />
                      <h3 className="text-base font-semibold text-foreground">Claude</h3>
                    </div>
                    <p className="text-sm text-foreground/90">
                      {
                        getProviderSummary({
                          enabled: providerSettings?.claude.enabled ?? true,
                          connection: claudeConnection,
                        }).headline
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        getProviderSummary({
                          enabled: providerSettings?.claude.enabled ?? true,
                          connection: claudeConnection,
                        }).detail
                      }
                    </p>
                  </div>
                  <Switch
                    checked={providerSettings?.claude.enabled ?? true}
                    onCheckedChange={(enabled) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              claude: { ...current.claude, enabled },
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Claude binary path</h4>
                  <Input
                    value={providerSettings?.claude.binaryPath ?? ""}
                    onChange={(event) =>
                      setProviderSettings((current) =>
                        current
                          ? {
                              ...current,
                              claude: { ...current.claude, binaryPath: event.target.value },
                            }
                          : current,
                      )
                    }
                    placeholder="claude"
                  />
                  <p className="text-xs text-muted-foreground">Path to the Claude binary</p>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => void saveProvider("claude")}
                    disabled={!providerSettings || savingProviderId === "claude" || !claudeDirty}
                  >
                    {savingProviderId === "claude" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Save Claude settings
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold tracking-tight">About</h2>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm">
            <div className="px-4 py-4 sm:px-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Codex</h3>
                <p className="text-sm text-muted-foreground">
                  OpenAI Codex agent that runs locally via the{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">codex</code> CLI. Used
                  for project tasks like resume parsing and job discovery.
                </p>
              </div>
            </div>
            <div className="mt-1 px-4 py-4 sm:px-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Claude</h3>
                <p className="text-sm text-muted-foreground">
                  Claude provider uses the local{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">claude</code> CLI
                  binary.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
