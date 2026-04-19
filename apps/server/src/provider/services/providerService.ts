import type { ChatModelSelection, ProviderId, ProviderModel } from "@jobseeker/contracts";
import { Context } from "effect";

import type { ProviderRuntimeOptions } from "../types";
import type { ProviderAdapterShape } from "./providerAdapter";

export interface ProviderServiceSession {
  readonly threadId: string;
  readonly provider: ProviderId;
}

export type ProviderServiceEvent =
  | {
      readonly type: "session.started";
      readonly threadId: string;
      readonly provider: ProviderId;
      readonly ts: number;
    }
  | {
      readonly type: "session.stopped";
      readonly threadId: string;
      readonly provider: ProviderId;
      readonly reason: "normal" | "interrupted";
      readonly ts: number;
    }
  | {
      readonly type: "turn.started";
      readonly threadId: string;
      readonly turnId: string;
      readonly provider: ProviderId;
      readonly ts: number;
    }
  | {
      readonly type: "turn.delta";
      readonly threadId: string;
      readonly turnId: string;
      readonly provider: ProviderId;
      readonly chunk: string;
      readonly ts: number;
    }
  | {
      readonly type: "turn.completed";
      readonly threadId: string;
      readonly turnId: string;
      readonly provider: ProviderId;
      readonly textLength: number;
      readonly ts: number;
    }
  | {
      readonly type: "turn.interrupted";
      readonly threadId: string;
      readonly turnId: string;
      readonly provider: ProviderId;
      readonly ts: number;
    }
  | {
      readonly type: "turn.failed";
      readonly threadId: string;
      readonly turnId: string;
      readonly provider: ProviderId;
      readonly error: unknown;
      readonly ts: number;
    };

export interface ProviderServiceTurn {
  readonly turnId: string;
  readonly provider: ProviderId;
  readonly stream: AsyncIterable<string> & {
    result: Promise<{ text: string }>;
  };
}

export interface ProviderServiceShape {
  readonly listProviders: () => ReadonlyArray<ProviderAdapterShape>;
  readonly startSession: (threadId: string, provider?: ProviderId) => ProviderServiceSession | null;
  readonly stopSession: (threadId: string) => void;
  readonly interruptSession: (threadId: string) => boolean;
  readonly listSessions: () => ReadonlyArray<ProviderServiceSession>;
  readonly modelsForSession: (threadId: string) => Promise<ReadonlyArray<ProviderModel>>;
  readonly respond: (input: {
    readonly threadId: string;
    readonly provider?: ProviderId;
    readonly prompt: string;
    readonly history: { role: string; content: string }[];
    readonly selection?: ChatModelSelection;
    readonly runtime?: ProviderRuntimeOptions;
  }) => ProviderServiceTurn | null;
  readonly sendTurn: (input: {
    readonly threadId: string;
    readonly provider?: ProviderId;
    readonly prompt: string;
    readonly history: { role: string; content: string }[];
    readonly selection?: ChatModelSelection;
    readonly runtime?: ProviderRuntimeOptions;
  }) => ProviderServiceTurn | null;
  readonly streamEvents: (threadId?: string) => AsyncIterable<ProviderServiceEvent>;
  readonly listAdapters: () => ReadonlyArray<ProviderAdapterShape>;
  readonly pickAdapter: (provider?: ProviderId) => ProviderAdapterShape | null;
}

export class ProviderService extends Context.Service<ProviderService, ProviderServiceShape>()(
  "jobseeker/provider/services/providerService",
) {}
