import type { ProviderModel } from "@jobseeker/contracts";

import { connectToOpenCodeServer, createOpenCodeSdkClient } from "../lib/opencode";
import { getProviderSettings, type ProviderSettings } from "../lib/provider-settings";
import { mergeProviderModels } from "./utils";

export const OPENCODE_FALLBACK_MODELS: ProviderModel[] = [
  {
    slug: "openai/gpt-5",
    name: "OpenAI · GPT-5",
    capabilities: {
      reasoningEffort: [],
      defaultEffort: "medium",
    },
  },
];

export interface ParsedOpenCodeModelSlug {
  readonly providerID: string;
  readonly modelID: string;
}

export function parseOpenCodeModelSlug(
  slug: string | null | undefined,
): ParsedOpenCodeModelSlug | null {
  if (typeof slug !== "string") {
    return null;
  }

  const trimmed = slug.trim();
  const separator = trimmed.indexOf("/");
  if (separator <= 0 || separator === trimmed.length - 1) {
    return null;
  }

  return {
    providerID: trimmed.slice(0, separator),
    modelID: trimmed.slice(separator + 1),
  };
}

function modelsFromProviderList(providerList: {
  providers?: Array<{
    id: string;
    name: string;
    models: Record<string, { name?: string }>;
  }>;
  default?: Record<string, string>;
}): ProviderModel[] {
  const discovered: ProviderModel[] = [];
  const providers = providerList.providers ?? [];

  for (const provider of providers) {
    for (const [modelID, model] of Object.entries(provider.models ?? {})) {
      discovered.push({
        slug: `${provider.id}/${modelID}`,
        name: `${provider.name} · ${model.name ?? modelID}`,
        capabilities: {
          reasoningEffort: [],
          defaultEffort: "medium",
        },
      });
    }
  }

  if (discovered.length > 0) {
    return discovered;
  }

  const defaults = providerList.default ?? {};
  for (const [providerID, modelID] of Object.entries(defaults)) {
    discovered.push({
      slug: `${providerID}/${modelID}`,
      name: `${providerID} · ${modelID}`,
      capabilities: {
        reasoningEffort: [],
        defaultEffort: "medium",
      },
    });
  }

  return discovered;
}

export async function loadOpenCodeModels(input?: {
  settings?: ProviderSettings;
  connection?: Awaited<ReturnType<typeof connectToOpenCodeServer>>;
  cwd?: string;
}): Promise<ProviderModel[]> {
  const settings = input?.settings ?? getProviderSettings();
  const activeConnection =
    input?.connection ??
    (await connectToOpenCodeServer({
      binaryPath: settings.opencode.binaryPath,
      serverUrl: settings.opencode.serverUrl,
    }));

  try {
    const client = createOpenCodeSdkClient({
      baseUrl: activeConnection.url,
      directory: input?.cwd ?? process.cwd(),
      serverPassword: settings.opencode.serverPassword,
    });

    const providers = await client.config.providers();
    const discovered = modelsFromProviderList(providers.data ?? {});
    return mergeProviderModels(
      discovered.length > 0 ? discovered : OPENCODE_FALLBACK_MODELS,
      settings.opencode.customModels,
    );
  } finally {
    if (!input?.connection) {
      activeConnection.close();
    }
  }
}
