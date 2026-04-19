import type { ProviderId } from "@jobseeker/contracts";
import { Context } from "effect";

import type { ChatProvider } from "../types";

export interface ProviderRegistryShape {
  readonly listProviders: () => ReadonlyArray<ChatProvider>;
  readonly pickProvider: (id?: ProviderId) => ChatProvider | null;
}

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "jobseeker/provider/services/providerRegistry",
) {}
