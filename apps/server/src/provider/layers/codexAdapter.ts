import * as Layer from "effect/Layer";

import { CodexAdapter } from "../services/codexAdapter";
import type { ProviderAdapterShape } from "../services/providerAdapter";
import { makeCodexProvider } from "./codexProvider";

export function makeCodexAdapter(): ProviderAdapterShape {
  const provider = makeCodexProvider();
  return {
    provider: provider.id,
    models: provider.models,
    available: provider.available,
    run: provider.run,
  };
}

export const CodexAdapterLive = Layer.succeed(CodexAdapter, makeCodexAdapter());
