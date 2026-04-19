import { Context } from "effect";

import type { ProviderAdapterShape } from "./providerAdapter";

export interface OpenCodeAdapterShape extends ProviderAdapterShape {}

export class OpenCodeAdapter extends Context.Service<OpenCodeAdapter, OpenCodeAdapterShape>()(
  "jobseeker/provider/services/openCodeAdapter",
) {}
