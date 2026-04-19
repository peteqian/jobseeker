import type { ProviderId } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import type { ProviderAdapterShape } from "../services/providerAdapter";
import { ProviderAdapterRegistry } from "../services/providerAdapterRegistry";
import { makeClaudeAdapter } from "./claudeAdapter";
import { makeCodexAdapter } from "./codexAdapter";
import { makeOpenCodeAdapter } from "./openCodeAdapter";

const adapters: ProviderAdapterShape[] = [
  makeCodexAdapter(),
  makeClaudeAdapter(),
  makeOpenCodeAdapter(),
];

export function listProviderAdapters(): ProviderAdapterShape[] {
  return adapters;
}

export function pickProviderAdapter(provider?: ProviderId): ProviderAdapterShape | null {
  if (provider) {
    return adapters.find((adapter) => adapter.provider === provider && adapter.available()) ?? null;
  }
  return adapters.find((adapter) => adapter.available()) ?? null;
}

export const ProviderAdapterRegistryLive = Layer.succeed(ProviderAdapterRegistry, {
  getByProvider: (provider: ProviderId) =>
    adapters.find((adapter) => adapter.provider === provider) ?? null,
  listProviders: () => adapters.map((adapter) => adapter.provider),
});
