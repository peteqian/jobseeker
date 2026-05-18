import type { ThreadStreamEnvelope } from "./service";

interface ThreadEventSubscriber {
  readonly id: number;
  readonly threadId: string;
  closed: boolean;
  pending: ThreadStreamEnvelope[];
  resolveNext: ((event: ThreadStreamEnvelope | null) => void) | null;
}

const threadEventSubscribers = new Map<number, ThreadEventSubscriber>();
let nextThreadEventSubscriberId = 0;

export function publishThreadEvent(threadId: string, event: ThreadStreamEnvelope): void {
  for (const subscriber of threadEventSubscribers.values()) {
    if (subscriber.closed || subscriber.threadId !== threadId) {
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

async function nextThreadEvent(
  subscriber: ThreadEventSubscriber,
): Promise<ThreadStreamEnvelope | null> {
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

function stopThreadEventSubscription(subscriber: ThreadEventSubscriber): void {
  if (subscriber.closed) {
    return;
  }

  subscriber.closed = true;
  threadEventSubscribers.delete(subscriber.id);
  if (subscriber.resolveNext) {
    const resolve = subscriber.resolveNext;
    subscriber.resolveNext = null;
    resolve(null);
  }
}

export function subscribeThreadEvents(threadId: string): AsyncIterable<ThreadStreamEnvelope> {
  const subscriber: ThreadEventSubscriber = {
    id: ++nextThreadEventSubscriberId,
    threadId,
    closed: false,
    pending: [],
    resolveNext: null,
  };
  threadEventSubscribers.set(subscriber.id, subscriber);

  return (async function* () {
    try {
      while (true) {
        const event = await nextThreadEvent(subscriber);
        if (!event) {
          break;
        }
        yield event;
      }
    } finally {
      stopThreadEventSubscription(subscriber);
    }
  })();
}
