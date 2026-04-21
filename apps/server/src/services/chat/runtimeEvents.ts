import type { ProviderId, RuntimeEventType } from "@jobseeker/contracts";

import { db } from "../../db";
import { providerSessionRuntime } from "../../db/schema";
import { writeProjectRuntimeEvent } from "../runtimeEvents";
import { appendThreadEvent } from "./projectionStore";
import { publishThreadEvent } from "./subscriptions";
import type { ThreadStreamEnvelope, ThreadStreamEvent } from "./service";

function now(): string {
  return new Date().toISOString();
}

export async function touchRuntime(
  threadId: string,
  providerName: ProviderId,
  payload: Record<string, unknown>,
): Promise<void> {
  const ts = now();
  await db
    .insert(providerSessionRuntime)
    .values({
      threadId,
      providerName,
      adapterKey: providerName,
      status: "running",
      lastSeenAt: ts,
      resumeCursorJson: JSON.stringify({ threadId }),
      runtimePayloadJson: JSON.stringify(payload),
    })
    .onConflictDoUpdate({
      target: providerSessionRuntime.threadId,
      set: {
        status: "running",
        lastSeenAt: ts,
        runtimePayloadJson: JSON.stringify(payload),
      },
    });
}

export async function writeThreadRuntimeEvent(
  projectId: string,
  type: RuntimeEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await writeProjectRuntimeEvent(projectId, type, payload);
}

export async function emitThreadEvent(
  projectId: string,
  threadId: string,
  event: ThreadStreamEvent,
): Promise<ThreadStreamEnvelope> {
  const envelope = await appendThreadEvent(threadId, event);
  await writeThreadRuntimeEvent(projectId, "thread.stream.event", {
    threadId,
    sequence: envelope.sequence,
    event,
  });
  publishThreadEvent(threadId, envelope);
  return envelope;
}
