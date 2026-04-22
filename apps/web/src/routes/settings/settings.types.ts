import type { ConnectionStatus, ProviderSettings } from "@/lib/api";

export type ProviderId = "codex" | "claude" | "opencode";

export interface StatusBadgeProps {
  ok: boolean;
}

export interface ConnectionRowProps {
  connection: ConnectionStatus;
}

export interface ProviderSummary {
  headline: string;
  detail: string;
  dotClass: string;
}

export interface ProviderCardProps {
  providerId: ProviderId;
  providerSettings: ProviderSettings | null;
  connection: ConnectionStatus | null;
  isDirty: boolean;
  isSaving: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onUpdateSettings: (settings: Partial<ProviderSettings[ProviderId]>) => void;
  onSave: () => void;
}
