import { Context } from "effect";

import type { ProviderAdapterShape } from "./providerAdapter";

export interface CodexAdapterShape extends ProviderAdapterShape {}

export class CodexAdapter extends Context.Service<CodexAdapter, CodexAdapterShape>()(
  "jobseeker/provider/services/codexAdapter",
) {}
