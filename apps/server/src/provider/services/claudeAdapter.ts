import { Context } from "effect";

import type { ProviderAdapterShape } from "./providerAdapter";

export interface ClaudeAdapterShape extends ProviderAdapterShape {}

export class ClaudeAdapter extends Context.Service<ClaudeAdapter, ClaudeAdapterShape>()(
  "jobseeker/provider/services/claudeAdapter",
) {}
