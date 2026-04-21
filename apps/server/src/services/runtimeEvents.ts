import type { RuntimeEventType } from "@jobseeker/contracts";

import { db } from "../db";
import { events } from "../db/schema";
import { makeId } from "../lib/ids";

function now(): string {
  return new Date().toISOString();
}

export async function writeProjectRuntimeEvent(
  projectId: string,
  type: RuntimeEventType,
  payload: unknown,
): Promise<void> {
  await db.insert(events).values({
    id: makeId("event"),
    projectId,
    type,
    createdAt: now(),
    payloadJson: JSON.stringify(payload ?? {}),
  });
}
