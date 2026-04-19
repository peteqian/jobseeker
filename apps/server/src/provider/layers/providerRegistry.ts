import type { ProviderId } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { ProviderRegistry } from "../services/providerRegistry";
import type { ChatProvider } from "../types";
import { makeClaudeProvider } from "./claudeProvider";
import { makeCodexProvider } from "./codexProvider";
import { makeOpenCodeProvider } from "./openCodeProvider";

const providers: ChatProvider[] = [
  makeCodexProvider(),
  makeClaudeProvider(),
  makeOpenCodeProvider(),
];

export function listChatProviders(): ChatProvider[] {
  return providers;
}

export function pickChatProvider(id?: ProviderId): ChatProvider | null {
  if (id) {
    return providers.find((provider) => provider.id === id && provider.available()) ?? null;
  }
  return providers.find((provider) => provider.available()) ?? null;
}

export const ProviderRegistryLive = Layer.succeed(ProviderRegistry, {
  listProviders: () => providers,
  pickProvider: (id?: ProviderId) => pickChatProvider(id),
});
