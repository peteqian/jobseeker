import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  chatProvidersQueryOptions,
  connectionsQueryOptions,
  providerSettingsQueryOptions,
} from "@/lib/query-options";
import { settingsKeys } from "@/lib/query-keys";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useTheme } from "@/components/theme-provider";
import { updateProviderSettings } from "@/lib/api";

import { ConnectionRow } from "./settings/-connection-row";
import { ProviderCard } from "./settings/-provider-card";
import type { ProviderId } from "./settings/-settings.types";

export const Route = createFileRoute("/settings")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(connectionsQueryOptions()),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions()),
    ]);
  },
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

function isProviderDirty(
  providerSettings: import("@/lib/api").ProviderSettings | null,
  savedProviderSettings: import("@/lib/api").ProviderSettings | null,
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
  useShellHeaderMeta(SETTINGS_HEADER);
  const queryClient = useQueryClient();
  const { theme, setTheme, routerDevtools, setRouterDevtools } = useTheme();
  const connectionsQuery = useQuery(connectionsQueryOptions());
  const providerSettingsQuery = useQuery(providerSettingsQueryOptions());
  const connections = connectionsQuery.data ?? [];
  const [providerSettings, setProviderSettings] = useState<
    import("@/lib/api").ProviderSettings | null
  >(null);
  const [savedProviderSettings, setSavedProviderSettings] = useState<
    import("@/lib/api").ProviderSettings | null
  >(null);
  const [savingProviderId, setSavingProviderId] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = connectionsQuery.isLoading || providerSettingsQuery.isLoading;

  const refresh = useCallback(async () => {
    setError(null);

    try {
      await Promise.all([connectionsQuery.refetch(), providerSettingsQuery.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check connections");
    }
  }, [connectionsQuery, providerSettingsQuery]);

  useEffect(() => {
    if (!providerSettingsQuery.data) {
      return;
    }

    setProviderSettings(providerSettingsQuery.data);
    setSavedProviderSettings(providerSettingsQuery.data);
  }, [providerSettingsQuery.data]);

  useEffect(() => {
    if (connectionsQuery.error) {
      setError(
        connectionsQuery.error instanceof Error
          ? connectionsQuery.error.message
          : "Failed to check connections",
      );
    }
  }, [connectionsQuery.error]);

  useEffect(() => {
    if (providerSettingsQuery.error) {
      setError(
        providerSettingsQuery.error instanceof Error
          ? providerSettingsQuery.error.message
          : "Failed to load provider settings",
      );
    }
  }, [providerSettingsQuery.error]);

  const saveProviderMutation = useMutation({
    mutationFn: (settings: Partial<import("@/lib/api").ProviderSettings>) =>
      updateProviderSettings(settings),
    onSuccess: async (saved) => {
      queryClient.setQueryData(settingsKeys.providers(), saved);
      setProviderSettings(saved);
      setSavedProviderSettings(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.connections() }),
        queryClient.invalidateQueries({ queryKey: chatProvidersQueryOptions().queryKey }),
      ]);
    },
  });

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
        await saveProviderMutation.mutateAsync(patch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save provider settings");
      } finally {
        setSavingProviderId(null);
      }
    },
    [providerSettings, saveProviderMutation],
  );

  const codexConnection = connections.find((connection) => connection.id === "codex") ?? null;
  const claudeConnection = connections.find((connection) => connection.id === "claude") ?? null;
  const opencodeConnection = connections.find((connection) => connection.id === "opencode") ?? null;

  const codexDirty = isProviderDirty(providerSettings, savedProviderSettings, "codex");
  const claudeDirty = isProviderDirty(providerSettings, savedProviderSettings, "claude");
  const opencodeDirty = isProviderDirty(providerSettings, savedProviderSettings, "opencode");

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
            <ProviderCard
              providerId="codex"
              providerSettings={providerSettings}
              connection={codexConnection}
              isDirty={codexDirty}
              isSaving={savingProviderId === "codex"}
              onToggleEnabled={(enabled) =>
                setProviderSettings((current) =>
                  current ? { ...current, codex: { ...current.codex, enabled } } : current,
                )
              }
              onUpdateSettings={(settings) =>
                setProviderSettings((current) =>
                  current ? { ...current, codex: { ...current.codex, ...settings } } : current,
                )
              }
              onSave={() => void saveProvider("codex")}
            />

            <ProviderCard
              providerId="opencode"
              providerSettings={providerSettings}
              connection={opencodeConnection}
              isDirty={opencodeDirty}
              isSaving={savingProviderId === "opencode"}
              onToggleEnabled={(enabled) =>
                setProviderSettings((current) =>
                  current ? { ...current, opencode: { ...current.opencode, enabled } } : current,
                )
              }
              onUpdateSettings={(settings) =>
                setProviderSettings((current) =>
                  current
                    ? { ...current, opencode: { ...current.opencode, ...settings } }
                    : current,
                )
              }
              onSave={() => void saveProvider("opencode")}
            />

            <ProviderCard
              providerId="claude"
              providerSettings={providerSettings}
              connection={claudeConnection}
              isDirty={claudeDirty}
              isSaving={savingProviderId === "claude"}
              onToggleEnabled={(enabled) =>
                setProviderSettings((current) =>
                  current ? { ...current, claude: { ...current.claude, enabled } } : current,
                )
              }
              onUpdateSettings={(settings) =>
                setProviderSettings((current) =>
                  current ? { ...current, claude: { ...current.claude, ...settings } } : current,
                )
              }
              onSave={() => void saveProvider("claude")}
            />
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
