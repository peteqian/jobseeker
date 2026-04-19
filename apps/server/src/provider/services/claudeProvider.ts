import { Context } from "effect";

import type { ChatProvider } from "../types";

export interface ClaudeProviderShape extends ChatProvider {}

export class ClaudeProvider extends Context.Service<ClaudeProvider, ClaudeProviderShape>()(
  "jobseeker/provider/services/claudeProvider",
) {}
