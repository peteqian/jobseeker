import { withCodexRefreshLock } from "../../lib/codexAuthLock";
import { codexAccessTokenSecondsToExpiry } from "../../lib/codexToken";
import { getProviderSettings } from "../../lib/provider-settings";

// How close to expiry counts as "refresh-prone". codex only rotates the token
// near expiry (a fresh token under concurrent load never refreshes), so outside
// this window concurrent codex work is safe to run unserialised. Generous by
// default so codex's own refresh margin falls inside it.
const GUARD_BUFFER_S = Math.max(
  60,
  Number.parseInt(process.env.CODEX_REFRESH_GUARD_S ?? "3600", 10) || 3600,
);

function codexHomeDir(): string | null {
  const settings = getProviderSettings();
  if (!settings.codex.enabled) return null;
  return settings.codex.homePath?.trim() || null;
}

/**
 * Runs `fn` (a codex-spawning call) so that, when the shared token is about to
 * be refreshed, only one codex process does so at a time.
 *
 * codex shares one `~/.codex/auth.json` across chat (app-server), the explorer
 * crawl (CLI), and the match pass (exec). OpenAI's refresh_token is single-use,
 * so two codex processes refreshing at once leaves one with
 * `refresh_token_reused` and a dead auth file. codex only refreshes when the
 * access token is near expiry, so:
 *
 * - token has comfortable runway -> run `fn` directly (full concurrency).
 * - token near expiry / unreadable -> run `fn` under a cross-process lock, so
 *   the single refresh that fires happens in isolation and persists cleanly
 *   before the next codex process reads the file.
 *
 * The lock is cross-process (file-based) because the racing codex processes are
 * separate OS processes an in-process mutex can't coordinate.
 */
export async function withCodexAuthGuard<T>(fn: () => Promise<T>): Promise<T> {
  const home = codexHomeDir();
  if (!home) return fn();
  const seconds = codexAccessTokenSecondsToExpiry(home);
  if (seconds !== null && seconds > GUARD_BUFFER_S) return fn();
  return withCodexRefreshLock(home, fn);
}
