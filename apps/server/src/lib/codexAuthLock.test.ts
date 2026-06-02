import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { readLockHolder, withCodexRefreshLock } from "./codexAuthLock";

const dirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "codex-lock-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("withCodexRefreshLock", () => {
  it("runs fn and releases the lock afterwards", async () => {
    const dir = freshDir();
    const out = await withCodexRefreshLock(dir, async () => "done");
    expect(out).toBe("done");
    expect(readLockHolder(dir)).toBeNull();
  });

  it("serialises concurrent holders — no overlap", async () => {
    const dir = freshDir();
    let active = 0;
    let maxActive = 0;
    const work = () =>
      withCodexRefreshLock(dir, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
      });
    await Promise.all([work(), work(), work()]);
    expect(maxActive).toBe(1);
    expect(existsSync(path.join(dir, ".jobseeker-refresh.lock"))).toBe(false);
  });

  it("releases the lock even when fn throws", async () => {
    const dir = freshDir();
    await expect(
      withCodexRefreshLock(dir, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(readLockHolder(dir)).toBeNull();
  });
});
