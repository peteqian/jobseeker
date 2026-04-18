import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useShellHeader } from "@/providers/shell-header-context";
import { useTheme } from "@/components/theme-provider";
import { type ConnectionStatus, getConnections } from "@/lib/api";

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

function SettingsPage() {
  useShellHeader(SETTINGS_HEADER);
  const { theme, setTheme, routerDevtools, setRouterDevtools } = useTheme();
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getConnections();
      setConnections(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
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

            <div className="border-t border-border/50 px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Router Devtools</h3>
                  <p className="text-sm text-muted-foreground">Show the TanStack Router panel.</p>
                </div>
                <Switch checked={routerDevtools} onCheckedChange={setRouterDevtools} />
              </div>
            </div>

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
                  Anthropic Claude API. Requires{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    ANTHROPIC_API_KEY
                  </code>{" "}
                  to be set on the server.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
