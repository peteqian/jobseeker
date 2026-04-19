import { Context } from "effect";

import type { ChatProvider } from "../types";

export interface ProviderAdapterShape extends Pick<ChatProvider, "models" | "available" | "run"> {
  readonly provider: ChatProvider["id"];
}

export class ProviderAdapter extends Context.Service<ProviderAdapter, ProviderAdapterShape>()(
  "jobseeker/provider/services/providerAdapter",
) {}
