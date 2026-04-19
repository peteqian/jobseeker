import * as Layer from "effect/Layer";

import { OpenCodeAdapter } from "../services/openCodeAdapter";
import type { ProviderAdapterShape } from "../services/providerAdapter";
import { makeOpenCodeProvider } from "./openCodeProvider";

export function makeOpenCodeAdapter(): ProviderAdapterShape {
  const provider = makeOpenCodeProvider();
  return {
    provider: provider.id,
    models: provider.models,
    available: provider.available,
    run: provider.run,
  };
}

export const OpenCodeAdapterLive = Layer.succeed(OpenCodeAdapter, makeOpenCodeAdapter());
