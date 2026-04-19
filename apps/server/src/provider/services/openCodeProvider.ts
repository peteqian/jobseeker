import { Context } from "effect";

import type { ChatProvider } from "../types";

export interface OpenCodeProviderShape extends ChatProvider {}

export class OpenCodeProvider extends Context.Service<OpenCodeProvider, OpenCodeProviderShape>()(
  "jobseeker/provider/services/openCodeProvider",
) {}
