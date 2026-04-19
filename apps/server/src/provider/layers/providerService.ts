import type { ProviderId } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import {
  ProviderService,
  type ProviderServiceEvent,
  type ProviderServiceShape,
} from "../services/providerService";
import { listProviderAdapters, pickProviderAdapter } from "./providerAdapterRegistry";

interface RuntimeSubscriber {
  readonly id: number;
  readonly threadId?: string;
  closed: boolean;
  pending: ProviderServiceEvent[];
  resolveNext: ((event: ProviderServiceEvent | null) => void) | null;
}

interface ActiveTurn {
  readonly id: string;
  readonly provider: ProviderId;
  readonly controller: AbortController;
}

const sessionByThread = new Map<string, ProviderId>();
const activeTurnByThread = new Map<string, ActiveTurn>();
const runtimeSubscribers = new Map<number, RuntimeSubscriber>();

let nextTurnCounter = 0;
let nextSubscriberCounter = 0;

function nowTs(): number {
  return Date.now();
}

function makeTurnId(threadId: string): string {
  nextTurnCounter += 1;
  return `${threadId}:${nextTurnCounter}`;
}

function publishRuntimeEvent(event: ProviderServiceEvent): void {
  for (const subscriber of runtimeSubscribers.values()) {
    if (subscriber.closed) {
      continue;
    }
    if (subscriber.threadId && subscriber.threadId !== event.threadId) {
      continue;
    }

    if (subscriber.resolveNext) {
      const resolve = subscriber.resolveNext;
      subscriber.resolveNext = null;
      resolve(event);
      continue;
    }

    subscriber.pending.push(event);
  }
}

async function nextRuntimeEvent(
  subscriber: RuntimeSubscriber,
): Promise<ProviderServiceEvent | null> {
  if (subscriber.pending.length > 0) {
    return subscriber.pending.shift() ?? null;
  }
  if (subscriber.closed) {
    return null;
  }

  return new Promise((resolve) => {
    subscriber.resolveNext = resolve;
  });
}

function stopRuntimeSubscription(subscriber: RuntimeSubscriber): void {
  if (subscriber.closed) {
    return;
  }

  subscriber.closed = true;
  runtimeSubscribers.delete(subscriber.id);
  if (subscriber.resolveNext) {
    const resolve = subscriber.resolveNext;
    subscriber.resolveNext = null;
    resolve(null);
  }
}

function interruptActiveTurn(threadId: string): ActiveTurn | null {
  const activeTurn = activeTurnByThread.get(threadId);
  if (!activeTurn) {
    return null;
  }

  activeTurnByThread.delete(threadId);
  activeTurn.controller.abort();
  publishRuntimeEvent({
    type: "turn.interrupted",
    threadId,
    turnId: activeTurn.id,
    provider: activeTurn.provider,
    ts: nowTs(),
  });
  return activeTurn;
}

const providerServiceShape: ProviderServiceShape = {
  listProviders: () => listProviderAdapters(),

  startSession: (threadId: string, provider?: ProviderId) => {
    const adapter = pickProviderAdapter(provider);
    if (!adapter) {
      return null;
    }

    sessionByThread.set(threadId, adapter.provider);
    publishRuntimeEvent({
      type: "session.started",
      threadId,
      provider: adapter.provider,
      ts: nowTs(),
    });
    return { threadId, provider: adapter.provider };
  },

  stopSession: (threadId: string) => {
    const provider = sessionByThread.get(threadId);
    if (!provider) {
      return;
    }

    const interruptedTurn = interruptActiveTurn(threadId);
    sessionByThread.delete(threadId);
    publishRuntimeEvent({
      type: "session.stopped",
      threadId,
      provider,
      reason: interruptedTurn ? "interrupted" : "normal",
      ts: nowTs(),
    });
  },

  interruptSession: (threadId: string) => {
    const interruptedTurn = interruptActiveTurn(threadId);
    return Boolean(interruptedTurn);
  },

  listSessions: () =>
    [...sessionByThread.entries()].map(([threadId, provider]) => ({ threadId, provider })),

  modelsForSession: async (threadId: string) => {
    const provider = sessionByThread.get(threadId);
    const adapter = provider ? pickProviderAdapter(provider) : null;
    if (!adapter) {
      return [];
    }

    return adapter.models();
  },

  respond: (input) => {
    const activeProvider = sessionByThread.get(input.threadId);
    const adapter = pickProviderAdapter(
      activeProvider ?? input.provider ?? input.selection?.provider,
    );
    if (!adapter) {
      return null;
    }

    const previousTurn = interruptActiveTurn(input.threadId);
    const shouldEmitSessionStart = activeProvider !== adapter.provider;
    sessionByThread.set(input.threadId, adapter.provider);

    const turnId = makeTurnId(input.threadId);
    const controller = new AbortController();
    const activeTurn: ActiveTurn = {
      id: turnId,
      provider: adapter.provider,
      controller,
    };
    activeTurnByThread.set(input.threadId, activeTurn);

    if (previousTurn) {
      publishRuntimeEvent({
        type: "session.stopped",
        threadId: input.threadId,
        provider: previousTurn.provider,
        reason: "interrupted",
        ts: nowTs(),
      });
    }

    if (shouldEmitSessionStart) {
      publishRuntimeEvent({
        type: "session.started",
        threadId: input.threadId,
        provider: adapter.provider,
        ts: nowTs(),
      });
    }
    publishRuntimeEvent({
      type: "turn.started",
      threadId: input.threadId,
      turnId,
      provider: adapter.provider,
      ts: nowTs(),
    });

    const rawStream = adapter.run(
      input.prompt,
      input.history,
      input.selection,
      input.runtime,
      controller.signal,
    );

    const resultPromise = rawStream.result
      .then((result) => {
        if (controller.signal.aborted) {
          throw new Error("Provider turn interrupted");
        }
        publishRuntimeEvent({
          type: "turn.completed",
          threadId: input.threadId,
          turnId,
          provider: adapter.provider,
          textLength: result.text.length,
          ts: nowTs(),
        });
        return result;
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          publishRuntimeEvent({
            type: "turn.failed",
            threadId: input.threadId,
            turnId,
            provider: adapter.provider,
            error,
            ts: nowTs(),
          });
        }
        throw error;
      })
      .finally(() => {
        const current = activeTurnByThread.get(input.threadId);
        if (current?.id === turnId) {
          activeTurnByThread.delete(input.threadId);
        }
      });

    const stream = (async function* () {
      for await (const chunk of rawStream) {
        publishRuntimeEvent({
          type: "turn.delta",
          threadId: input.threadId,
          turnId,
          provider: adapter.provider,
          chunk,
          ts: nowTs(),
        });
        yield chunk;
      }
    })();

    return {
      turnId,
      provider: adapter.provider,
      stream: Object.assign(stream, { result: resultPromise }),
    };
  },

  sendTurn: (input) => providerServiceShape.respond(input),

  streamEvents: (threadId?: string) => {
    const subscriber: RuntimeSubscriber = {
      id: ++nextSubscriberCounter,
      threadId,
      closed: false,
      pending: [],
      resolveNext: null,
    };
    runtimeSubscribers.set(subscriber.id, subscriber);

    return (async function* () {
      try {
        while (true) {
          const event = await nextRuntimeEvent(subscriber);
          if (!event) {
            break;
          }
          yield event;
        }
      } finally {
        stopRuntimeSubscription(subscriber);
      }
    })();
  },

  listAdapters: () => listProviderAdapters(),

  pickAdapter: (provider?: ProviderId) => pickProviderAdapter(provider),
};

export const ProviderServiceLive = Layer.succeed(ProviderService, providerServiceShape);
