import { describe, expect, it, mock } from "bun:test";

let secondsToExpiry: number | null = 99_999;
let lockCalls = 0;

mock.module("../../lib/provider-settings", () => ({
  getProviderSettings: () => ({ codex: { enabled: true, homePath: "/tmp/fake-codex-home" } }),
}));
mock.module("../../lib/codexToken", () => ({
  codexAccessTokenSecondsToExpiry: () => secondsToExpiry,
}));
mock.module("../../lib/codexAuthLock", () => ({
  withCodexRefreshLock: async (_dir: string, fn: () => Promise<unknown>) => {
    lockCalls += 1;
    return fn();
  },
}));

const { withCodexAuthGuard } = await import("./codexAuth");

describe("withCodexAuthGuard", () => {
  it("runs directly (no lock) when the token has comfortable runway", async () => {
    lockCalls = 0;
    secondsToExpiry = 10 * 60 * 60; // 10h, well past the 1h buffer
    const out = await withCodexAuthGuard(async () => "ok");
    expect(out).toBe("ok");
    expect(lockCalls).toBe(0);
  });

  it("serialises under the lock when the token is near expiry", async () => {
    lockCalls = 0;
    secondsToExpiry = 60; // inside the 1h buffer
    const out = await withCodexAuthGuard(async () => "ok");
    expect(out).toBe("ok");
    expect(lockCalls).toBe(1);
  });

  it("serialises when the token is unreadable", async () => {
    lockCalls = 0;
    secondsToExpiry = null;
    await withCodexAuthGuard(async () => "ok");
    expect(lockCalls).toBe(1);
  });

  it("serialises an already-expired token", async () => {
    lockCalls = 0;
    secondsToExpiry = -120;
    await withCodexAuthGuard(async () => "ok");
    expect(lockCalls).toBe(1);
  });
});
