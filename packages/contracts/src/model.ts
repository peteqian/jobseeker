export type ProviderId = "codex" | "claude";

export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  codex: "Codex",
  claude: "Claude",
};

export interface ProviderModelCapabilities {
  reasoningEffort: string[];
  defaultEffort: string;
}

export interface ProviderModel {
  slug: string;
  name: string;
  capabilities: ProviderModelCapabilities;
}

export interface ChatModelSelection {
  provider?: ProviderId;
  model?: string;
  effort?: string;
}

export const CODEX_MODELS: ProviderModel[] = [
  {
    slug: "gpt-5.4",
    name: "GPT-5.4",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
  {
    slug: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
  {
    slug: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
  {
    slug: "gpt-5.3-codex-spark",
    name: "GPT-5.3 Codex Spark",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
  {
    slug: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
  {
    slug: "gpt-5.2",
    name: "GPT-5.2",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
];

export const CLAUDE_MODELS: ProviderModel[] = [
  {
    slug: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
  {
    slug: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    capabilities: {
      reasoningEffort: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
  },
];
