import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { dataDir } from "../env";

export interface ProviderSettings {
  codex: {
    enabled: boolean;
    binaryPath: string;
    homePath: string;
  };
  claude: {
    enabled: boolean;
    binaryPath: string;
  };
  opencode: {
    enabled: boolean;
    binaryPath: string;
    serverUrl: string;
    serverPassword: string;
    customModels: string[];
  };
}

export type ProviderSettingsPatch = {
  codex?: {
    enabled?: boolean;
    binaryPath?: string;
    homePath?: string;
  };
  claude?: {
    enabled?: boolean;
    binaryPath?: string;
  };
  opencode?: {
    enabled?: boolean;
    binaryPath?: string;
    serverUrl?: string;
    serverPassword?: string;
    customModels?: string[];
  };
};

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  codex: {
    enabled: true,
    binaryPath: "codex",
    homePath: "",
  },
  claude: {
    enabled: true,
    binaryPath: "claude",
  },
  opencode: {
    enabled: true,
    binaryPath: "opencode",
    serverUrl: "",
    serverPassword: "",
    customModels: [],
  },
};

const settingsPath = path.join(dataDir, "provider-settings.json");

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  if (trimmed === "~") {
    return os.homedir();
  }
  return trimmed;
}

function normalize(settings: Partial<ProviderSettings> | null | undefined): ProviderSettings {
  return {
    codex: {
      enabled: settings?.codex?.enabled ?? DEFAULT_PROVIDER_SETTINGS.codex.enabled,
      binaryPath: settings?.codex?.binaryPath?.trim() || DEFAULT_PROVIDER_SETTINGS.codex.binaryPath,
      homePath: normalizePath(
        settings?.codex?.homePath || DEFAULT_PROVIDER_SETTINGS.codex.homePath,
      ),
    },
    claude: {
      enabled: settings?.claude?.enabled ?? DEFAULT_PROVIDER_SETTINGS.claude.enabled,
      binaryPath:
        settings?.claude?.binaryPath?.trim() || DEFAULT_PROVIDER_SETTINGS.claude.binaryPath,
    },
    opencode: {
      enabled: settings?.opencode?.enabled ?? DEFAULT_PROVIDER_SETTINGS.opencode.enabled,
      binaryPath:
        settings?.opencode?.binaryPath?.trim() || DEFAULT_PROVIDER_SETTINGS.opencode.binaryPath,
      serverUrl:
        settings?.opencode?.serverUrl?.trim() ?? DEFAULT_PROVIDER_SETTINGS.opencode.serverUrl,
      serverPassword:
        settings?.opencode?.serverPassword?.trim() ??
        DEFAULT_PROVIDER_SETTINGS.opencode.serverPassword,
      customModels:
        settings?.opencode?.customModels ?? DEFAULT_PROVIDER_SETTINGS.opencode.customModels,
    },
  };
}

export function getProviderSettings(): ProviderSettings {
  try {
    if (!existsSync(settingsPath)) {
      return DEFAULT_PROVIDER_SETTINGS;
    }
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProviderSettings>;
    return normalize(parsed);
  } catch {
    return DEFAULT_PROVIDER_SETTINGS;
  }
}

export function updateProviderSettings(next: ProviderSettingsPatch): ProviderSettings {
  const current = getProviderSettings();
  const merged: Partial<ProviderSettings> = {
    codex: {
      enabled: next.codex?.enabled ?? current.codex.enabled,
      binaryPath: next.codex?.binaryPath ?? current.codex.binaryPath,
      homePath: next.codex?.homePath ?? current.codex.homePath,
    },
    claude: {
      enabled: next.claude?.enabled ?? current.claude.enabled,
      binaryPath: next.claude?.binaryPath ?? current.claude.binaryPath,
    },
    opencode: {
      enabled: next.opencode?.enabled ?? current.opencode.enabled,
      binaryPath: next.opencode?.binaryPath ?? current.opencode.binaryPath,
      serverUrl: next.opencode?.serverUrl ?? current.opencode.serverUrl,
      serverPassword: next.opencode?.serverPassword ?? current.opencode.serverPassword,
      customModels: next.opencode?.customModels ?? current.opencode.customModels,
    },
  };
  const normalized = normalize(merged);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}
