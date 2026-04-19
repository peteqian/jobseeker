import type { ProviderId } from "@jobseeker/contracts";
import { Context } from "effect";

import type { ProviderAdapterShape } from "./providerAdapter";

export interface ProviderAdapterRegistryShape {
  readonly getByProvider: (provider: ProviderId) => ProviderAdapterShape | null;
  readonly listProviders: () => ReadonlyArray<ProviderId>;
}

export class ProviderAdapterRegistry extends Context.Service<
  ProviderAdapterRegistry,
  ProviderAdapterRegistryShape
>()("jobseeker/provider/services/providerAdapterRegistry") {}
