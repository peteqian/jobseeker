/**
 * Pauses an explorer run while the user signs in to a site.
 *
 * When the agent hits a login wall it calls `report_blocked`, which awaits
 * `waitForLogin(taskId)`. The agent loop (and the browser window) stay open
 * mid-step. The HTTP "continue-login" endpoint calls `resolveLogin(taskId)`
 * once the user has signed in, unblocking the run on the same — now
 * authenticated — persistent profile. Aborting the task also releases the wait.
 */
interface Pending {
  resolve: () => void;
}

const pending = new Map<string, Pending>();

/** Blocks until the matching `resolveLogin(taskId)` or the signal aborts. */
export function waitForLogin(taskId: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      pending.delete(taskId);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.set(taskId, {
      resolve: () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
    });
  });
}

/** Releases a paused run. Returns false when no run is awaiting login. */
export function resolveLogin(taskId: string): boolean {
  const entry = pending.get(taskId);
  if (!entry) return false;
  pending.delete(taskId);
  entry.resolve();
  return true;
}
