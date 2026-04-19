import * as Layer from "effect/Layer";

import { ClaudeAdapter } from "../services/claudeAdapter";
import type { ProviderAdapterShape } from "../services/providerAdapter";
import { makeClaudeProvider } from "./claudeProvider";

export function makeClaudeAdapter(): ProviderAdapterShape {
  const provider = makeClaudeProvider();
  return {
    provider: provider.id,
    models: provider.models,
    available: provider.available,
    run: provider.run,
  };
}

export const ClaudeAdapterLive = Layer.succeed(ClaudeAdapter, makeClaudeAdapter());
