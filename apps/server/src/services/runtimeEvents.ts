import type { RuntimeEvent, RuntimeEventType } from "@jobseeker/contracts";

import { db } from "../db";
import { events } from "../db/schema";
import { makeId } from "../lib/ids";

function now(): string {
  return new Date().toISOString();
}

type Listener = (event: RuntimeEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeProjectEvents(projectId: string, fn: Listener): () => void {
  let set = listeners.get(projectId);
  if (!set) {
    set = new Set();
    listeners.set(projectId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) listeners.delete(projectId);
  };
}

function publish(event: RuntimeEvent): void {
  const set = listeners.get(event.projectId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  }
}

/**
 * Persists a project-scoped runtime event for polling and replay by clients.
 */
export async function writeProjectRuntimeEvent(
  projectId: string,
  type: RuntimeEventType,
  payload: unknown,
): Promise<void> {
  const id = makeId("event");
  const createdAt = now();
  await db.insert(events).values({
    id,
    projectId,
    type,
    createdAt,
    payloadJson: JSON.stringify(payload ?? {}),
  });
  publish({ id, projectId, type, createdAt, payload: payload ?? {} } as RuntimeEvent);
}
