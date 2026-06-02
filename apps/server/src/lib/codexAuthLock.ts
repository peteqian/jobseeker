import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import path from "node:path";

import { logWarn } from "./log";

const LOCK_FILE = ".jobseeker-refresh.lock";
// A token refresh is a few network round-trips. If a lock file is older than
// this, the holder almost certainly died mid-refresh — steal it rather than
// stall every codex call behind a corpse.
const STALE_MS = 60_000;
// Cap how long we wait for the lock. Past this we proceed unguarded: a missed
// guard degrades to today's behaviour (a possible race), never a hang.
const ACQUIRE_TIMEOUT_MS = 30_000;
const POLL_MS = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function lockPath(dir: string): string {
  return path.join(dir, LOCK_FILE);
}

/** True when an existing lock is old enough that its holder is presumed dead. */
function isStale(file: string): boolean {
  try {
    return Date.now() - statSync(file).mtimeMs > STALE_MS;
  } catch {
    return false;
  }
}

/**
 * Runs `fn` while holding a cross-process exclusive lock in `dir`.
 *
 * codex shares one `~/.codex/auth.json` across every process (chat app-server,
 * explorer CLI, match-pass exec). OpenAI's refresh_token is single-use, so two
 * processes refreshing at once leaves one with `refresh_token_reused` and a dead
 * auth file. This lock serialises the refresh-prone window so only one codex
 * process touches the token at a time — across separate OS processes, which an
 * in-process mutex can't cover.
 *
 * Best-effort: if the lock can't be acquired within the timeout (e.g. a wedged
 * holder on a filesystem without working mtimes), `fn` still runs — an unguarded
 * call is no worse than not having the lock at all.
 */
export async function withCodexRefreshLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const file = lockPath(dir);
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  let fd: number | null = null;

  while (fd === null) {
    try {
      mkdirSync(dir, { recursive: true });
      fd = openSync(file, "wx");
      writeSync(fd, `${process.pid} ${Date.now()}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        // Can't even attempt the lock (e.g. unwritable dir). Run unguarded.
        logWarn("codex refresh lock unavailable", {
          error: error instanceof Error ? error.message : String(error),
        });
        return fn();
      }
      if (isStale(file)) {
        try {
          rmSync(file, { force: true });
        } catch {
          // Lost the steal race to another waiter; just retry.
        }
        continue;
      }
      if (Date.now() > deadline) {
        logWarn("codex refresh lock timed out — proceeding unguarded", { file });
        return fn();
      }
      await sleep(POLL_MS);
    }
  }

  try {
    return await fn();
  } finally {
    if (fd !== null) closeSync(fd);
    try {
      rmSync(file, { force: true });
    } catch {
      // Already removed (e.g. stolen as stale). Nothing to do.
    }
  }
}

/** Reads the pid recorded in a held lock, for diagnostics/tests. */
export function readLockHolder(dir: string): string | null {
  try {
    return readFileSync(lockPath(dir), "utf8");
  } catch {
    return null;
  }
}
