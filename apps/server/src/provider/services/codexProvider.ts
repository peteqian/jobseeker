import { Context } from "effect";

import type { ChatProvider } from "../types";

export interface CodexProviderShape extends ChatProvider {}

export class CodexProvider extends Context.Service<CodexProvider, CodexProviderShape>()(
  "jobseeker/provider/services/codexProvider",
) {}
