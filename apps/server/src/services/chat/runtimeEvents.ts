import { eq } from "drizzle-orm";
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

/**
 * Updates the last-known runtime state for a chat thread/provider pair.
 *
 * Explorer threads use this as a lightweight "what is currently attached to
 * this thread" record separate from the full thread event log.
 */
export async function updateThreadRuntimeState(
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

/**
 * The provider's native session, persisted so the next turn can resume it
 * instead of replaying the whole transcript. Locked to one provider+model per
 * thread; switching either restarts the session (see sendMessage).
 */
export interface ThreadResumeCursor {
  readonly provider: ProviderId;
  readonly model: string;
  readonly sessionId: string;
}

function isResumeCursor(value: unknown): value is ThreadResumeCursor {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === "string" && typeof v.model === "string" && typeof v.sessionId === "string"
  );
}

/** Reads the stored resume cursor for a thread, or null if none/invalid. */
export async function getThreadResumeCursor(threadId: string): Promise<ThreadResumeCursor | null> {
  const row = await db
    .select()
    .from(providerSessionRuntime)
    .where(eq(providerSessionRuntime.threadId, threadId))
    .get();
  if (!row?.resumeCursorJson) return null;
  try {
    const parsed = JSON.parse(row.resumeCursorJson);
    return isResumeCursor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persists the provider's native session id so the next turn can resume it. */
export async function setThreadResumeCursor(
  threadId: string,
  cursor: ThreadResumeCursor,
): Promise<void> {
  const ts = now();
  const resumeCursorJson = JSON.stringify(cursor);
  await db
    .insert(providerSessionRuntime)
    .values({
      threadId,
      providerName: cursor.provider,
      adapterKey: cursor.provider,
      status: "running",
      lastSeenAt: ts,
      resumeCursorJson,
      runtimePayloadJson: null,
    })
    .onConflictDoUpdate({
      target: providerSessionRuntime.threadId,
      set: {
        providerName: cursor.provider,
        adapterKey: cursor.provider,
        status: "running",
        lastSeenAt: ts,
        resumeCursorJson,
      },
    });
}

/** Clears the resume cursor so the next turn cold-starts (full replay). */
export async function clearThreadResumeCursor(threadId: string): Promise<void> {
  await db
    .update(providerSessionRuntime)
    .set({ resumeCursorJson: null, lastSeenAt: now() })
    .where(eq(providerSessionRuntime.threadId, threadId));
}

/** Writes a thread-scoped runtime event into the shared project event log. */
export async function writeThreadRuntimeEvent(
  projectId: string,
  type: RuntimeEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await writeProjectRuntimeEvent(projectId, type, payload);
}

/**
 * Appends a thread event to durable storage and immediately publishes it to
 * in-memory subscribers.
 */
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
