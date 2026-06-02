import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "bun:test";

import { db } from "../../db";
import { providerSessionRuntime } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  clearThreadResumeCursor,
  getThreadResumeCursor,
  setThreadResumeCursor,
} from "./runtimeEvents";
import { parseClaudeJson } from "../../provider/layers/claudeProvider";

const createdThreadIds: string[] = [];

function makeThreadId(): string {
  const id = `thread_${randomUUID()}`;
  createdThreadIds.push(id);
  return id;
}

afterEach(async () => {
  for (const id of createdThreadIds.splice(0)) {
    await db.delete(providerSessionRuntime).where(eq(providerSessionRuntime.threadId, id));
  }
});

describe("thread resume cursor", () => {
  it("round-trips provider/model/sessionId", async () => {
    const threadId = makeThreadId();
    await setThreadResumeCursor(threadId, {
      provider: "codex",
      model: "gpt-5.5",
      sessionId: "sess-1",
    });

    const cursor = await getThreadResumeCursor(threadId);
    expect(cursor).toEqual({ provider: "codex", model: "gpt-5.5", sessionId: "sess-1" });
  });

  it("overwrites in place on a new session", async () => {
    const threadId = makeThreadId();
    await setThreadResumeCursor(threadId, {
      provider: "codex",
      model: "gpt-5.5",
      sessionId: "sess-1",
    });
    await setThreadResumeCursor(threadId, {
      provider: "claude",
      model: "claude-x",
      sessionId: "sess-2",
    });

    const cursor = await getThreadResumeCursor(threadId);
    expect(cursor).toEqual({ provider: "claude", model: "claude-x", sessionId: "sess-2" });
  });

  it("returns null after clear", async () => {
    const threadId = makeThreadId();
    await setThreadResumeCursor(threadId, {
      provider: "opencode",
      model: "m",
      sessionId: "sess-3",
    });
    await clearThreadResumeCursor(threadId);
    expect(await getThreadResumeCursor(threadId)).toBeNull();
  });

  it("returns null for an unknown thread", async () => {
    expect(await getThreadResumeCursor(`thread_${randomUUID()}`)).toBeNull();
  });
});

describe("parseClaudeJson", () => {
  it("extracts result text and session id from json output", () => {
    const out = JSON.stringify({ type: "result", result: "  hello  ", session_id: "abc" });
    expect(parseClaudeJson(out)).toEqual({ text: "hello", sessionId: "abc" });
  });

  it("falls back to raw text when stdout is not json", () => {
    expect(parseClaudeJson("plain text reply")).toEqual({ text: "plain text reply" });
  });

  it("falls back when json lacks a result string", () => {
    expect(parseClaudeJson(JSON.stringify({ session_id: "x" }))).toEqual({
      text: '{"session_id":"x"}',
    });
  });
});
