import { and, asc, eq, gt, sql } from "drizzle-orm";

import { db } from "../../db";
import { threadCommands, threadEvents, threadProjections } from "../../db/schema";
import { makeId } from "../../lib/ids";
import type { ChatDispatchCommand, ThreadStreamEvent } from "./service";

export interface ThreadProjectionState {
  readonly threadId: string;
  readonly latestSequence: number;
  readonly isStreaming: boolean;
  readonly activeTurnId: string | null;
  readonly assistantDraft: string;
  readonly lastEventType: string | null;
  readonly lastError: string | null;
  readonly updatedAt: string;
}

export interface ThreadStreamEnvelope {
  readonly threadId: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly event: ThreadStreamEvent;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultProjection(threadId: string): ThreadProjectionState {
  return {
    threadId,
    latestSequence: 0,
    isStreaming: false,
    activeTurnId: null,
    assistantDraft: "",
    lastEventType: null,
    lastError: null,
    updatedAt: nowIso(),
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "unknown error";
}

function reduceProjectionState(
  prev: ThreadProjectionState,
  event: ThreadStreamEvent,
  sequence: number,
  updatedAt: string,
): ThreadProjectionState {
  if (event.type === "delta") {
    return {
      ...prev,
      latestSequence: sequence,
      isStreaming: true,
      assistantDraft: `${prev.assistantDraft}${event.chunk}`,
      lastEventType: event.type,
      updatedAt,
    };
  }

  if (event.type === "complete") {
    return {
      ...prev,
      latestSequence: sequence,
      isStreaming: false,
      activeTurnId: null,
      assistantDraft: "",
      lastEventType: event.type,
      lastError: null,
      updatedAt,
    };
  }

  if (event.type === "topicUpdate") {
    return {
      ...prev,
      latestSequence: sequence,
      lastEventType: event.type,
      updatedAt,
    };
  }

  switch (event.type) {
    case "turn.started":
      return {
        ...prev,
        latestSequence: sequence,
        isStreaming: true,
        activeTurnId: event.turnId,
        assistantDraft: "",
        lastEventType: event.type,
        lastError: null,
        updatedAt,
      };
    case "turn.completed":
    case "turn.interrupted":
      return {
        ...prev,
        latestSequence: sequence,
        isStreaming: false,
        activeTurnId: null,
        assistantDraft: "",
        lastEventType: event.type,
        updatedAt,
      };
    case "turn.failed":
      return {
        ...prev,
        latestSequence: sequence,
        isStreaming: false,
        activeTurnId: null,
        lastEventType: event.type,
        lastError: toErrorMessage(event.error),
        updatedAt,
      };
    default:
      return {
        ...prev,
        latestSequence: sequence,
        lastEventType: event.type,
        updatedAt,
      };
  }
}

function parseProjectionState(
  threadId: string,
  raw: string,
  fallbackSequence: number,
): ThreadProjectionState {
  try {
    const parsed = JSON.parse(raw) as Partial<ThreadProjectionState>;
    return {
      threadId,
      latestSequence:
        typeof parsed.latestSequence === "number" ? parsed.latestSequence : fallbackSequence,
      isStreaming: Boolean(parsed.isStreaming),
      activeTurnId: typeof parsed.activeTurnId === "string" ? parsed.activeTurnId : null,
      assistantDraft: typeof parsed.assistantDraft === "string" ? parsed.assistantDraft : "",
      lastEventType: typeof parsed.lastEventType === "string" ? parsed.lastEventType : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    };
  } catch {
    return defaultProjection(threadId);
  }
}

export async function recordThreadCommand(command: ChatDispatchCommand): Promise<void> {
  await db.insert(threadCommands).values({
    id: makeId("cmd"),
    threadId: command.threadId,
    commandType: command.type,
    commandJson: JSON.stringify(command),
    createdAt: nowIso(),
  });
}

export async function appendThreadEvent(
  threadId: string,
  event: ThreadStreamEvent,
): Promise<ThreadStreamEnvelope> {
  return db.transaction(async (tx) => {
    const currentSeqRow = await tx
      .select({ sequence: sql<number>`coalesce(max(${threadEvents.sequence}), 0)` })
      .from(threadEvents)
      .where(eq(threadEvents.threadId, threadId))
      .get();
    const sequence = (currentSeqRow?.sequence ?? 0) + 1;
    const createdAt = nowIso();

    await tx.insert(threadEvents).values({
      id: makeId("tevent"),
      threadId,
      sequence,
      eventType: event.type,
      eventJson: JSON.stringify(event),
      createdAt,
    });

    const existingProjection = await tx
      .select()
      .from(threadProjections)
      .where(eq(threadProjections.threadId, threadId))
      .get();

    const prevProjection = existingProjection
      ? parseProjectionState(
          threadId,
          existingProjection.stateJson,
          existingProjection.latestSequence,
        )
      : defaultProjection(threadId);
    const nextProjection = reduceProjectionState(prevProjection, event, sequence, createdAt);

    if (existingProjection) {
      await tx
        .update(threadProjections)
        .set({
          latestSequence: sequence,
          stateJson: JSON.stringify(nextProjection),
          updatedAt: createdAt,
        })
        .where(eq(threadProjections.threadId, threadId));
    } else {
      await tx.insert(threadProjections).values({
        threadId,
        latestSequence: sequence,
        stateJson: JSON.stringify(nextProjection),
        updatedAt: createdAt,
      });
    }

    return {
      threadId,
      sequence,
      createdAt,
      event,
    };
  });
}

export async function listThreadEvents(
  threadId: string,
  afterSequence = 0,
): Promise<ThreadStreamEnvelope[]> {
  const rows = await db
    .select()
    .from(threadEvents)
    .where(
      afterSequence > 0
        ? and(eq(threadEvents.threadId, threadId), gt(threadEvents.sequence, afterSequence))
        : eq(threadEvents.threadId, threadId),
    )
    .orderBy(asc(threadEvents.sequence))
    .all();

  const out: ThreadStreamEnvelope[] = [];
  for (const row of rows) {
    try {
      const event = JSON.parse(row.eventJson) as ThreadStreamEvent;
      out.push({
        threadId: row.threadId,
        sequence: row.sequence,
        createdAt: row.createdAt,
        event,
      });
    } catch {
      // Ignore malformed payload.
    }
  }
  return out;
}

export async function getThreadProjection(threadId: string): Promise<ThreadProjectionState> {
  const row = await db
    .select()
    .from(threadProjections)
    .where(eq(threadProjections.threadId, threadId))
    .get();

  if (!row) {
    return defaultProjection(threadId);
  }

  return parseProjectionState(threadId, row.stateJson, row.latestSequence);
}
