import { type ReactNode } from "react";
import { FolderOpen, KeyRound, Link, Loader2, Tags, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommaSeparatedInput } from "@/components/form/comma-separated-input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import type { ProviderCardProps, ProviderSummary } from "./-settings.types";

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

// Icon-led path/URL field: the help line below doubles as the label, so the
// input itself stays label-less with an example value as its placeholder.
function PathField({
  icon,
  value,
  onChange,
  placeholder,
  help,
  type = "text",
}: {
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  help: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <InputGroup>
        <InputGroupAddon>{icon}</InputGroupAddon>
        <InputGroupInput
          aria-label={help}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </InputGroup>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
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
  const extra = settings as unknown as Record<string, string>;

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
            <PathField
              icon={<Terminal />}
              value={settings?.binaryPath ?? ""}
              onChange={(value) => onUpdateSettings({ binaryPath: value })}
              placeholder="codex"
              help="Path to the Codex binary"
            />
            <PathField
              icon={<FolderOpen />}
              value={extra?.homePath ?? ""}
              onChange={(value) => onUpdateSettings({ homePath: value })}
              placeholder="CODEX_HOME (optional)"
              help="Optional custom Codex home and config directory."
            />
          </>
        )}

        {providerId === "opencode" && (
          <>
            <PathField
              icon={<Terminal />}
              value={settings?.binaryPath ?? ""}
              onChange={(value) => onUpdateSettings({ binaryPath: value })}
              placeholder="opencode"
              help="Path to the OpenCode binary"
            />
            <PathField
              icon={<FolderOpen />}
              value={extra?.configPath ?? ""}
              onChange={(value) => onUpdateSettings({ configPath: value })}
              placeholder="~/.config/opencode"
              help="Where OpenCode reads your config (sets XDG_CONFIG_HOME)."
            />
            <PathField
              icon={<Link />}
              value={extra?.serverUrl ?? ""}
              onChange={(value) => onUpdateSettings({ serverUrl: value })}
              placeholder="http://127.0.0.1:4096"
              help="Leave blank to let OpenCode spawn locally when needed."
            />
            <PathField
              icon={<KeyRound />}
              value={extra?.serverPassword ?? ""}
              onChange={(value) => onUpdateSettings({ serverPassword: value })}
              placeholder="Server password (optional)"
              help="Stored in plain text on disk."
            />
            <div className="space-y-1.5">
              <CommaSeparatedInput
                id="opencode-custom-models"
                name="customModels"
                value={(settings as unknown as Record<string, string[]>)?.customModels ?? []}
                onChange={(value) => onUpdateSettings({ customModels: value })}
                placeholder="openai/gpt-5, anthropic/claude-sonnet-4-5"
                icon={<Tags />}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated `provider/model` slugs.
              </p>
            </div>
          </>
        )}

        {providerId === "claude" && (
          <>
            <PathField
              icon={<Terminal />}
              value={settings?.binaryPath ?? ""}
              onChange={(value) => onUpdateSettings({ binaryPath: value })}
              placeholder="claude"
              help="Path to the Claude binary"
            />
            <PathField
              icon={<FolderOpen />}
              value={extra?.configPath ?? ""}
              onChange={(value) => onUpdateSettings({ configPath: value })}
              placeholder="~/.claude"
              help="Where Claude reads your login/config (CLAUDE_CONFIG_DIR)."
            />
          </>
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
