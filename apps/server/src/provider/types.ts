import type { ChatModelSelection, ProviderId, ProviderModel } from "@jobseeker/contracts";

export interface ProviderRuntimeOptions {
  cwd?: string;
  codexHome?: string;
}

export interface ChatProvider {
  id: ProviderId;
  models(): Promise<ProviderModel[]>;
  available(): boolean;
  run(
    prompt: string,
    history: { role: string; content: string }[],
    selection?: ChatModelSelection,
    runtime?: ProviderRuntimeOptions,
    signal?: AbortSignal,
  ): AsyncIterable<string> & {
    result: Promise<{ text: string }>;
  };
}
