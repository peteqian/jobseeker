import { existsSync } from "node:fs";
import { BrowserSession } from "@peteqian/browser-agent-sdk";

import { logInfo } from "./log";

type LaunchOptions = Parameters<typeof BrowserSession.launch>[0];

/** Standard install locations for real, branded Google Chrome per platform. */
const DEFAULT_CHROME_PATHS: Record<string, string[]> = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
  win32: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"],
};

/**
 * Resolves the user's real, branded Google Chrome.
 *
 * The SDK's `autoInstallBrowser` otherwise downloads "Chrome for Testing",
 * which Google restricts for sign-in (the "only for automated testing" banner)
 * — so Google/social login fails on it. Real Chrome ships Google's API keys and
 * is treated as a normal browser. Override the path with
 * `CHROME_EXECUTABLE_PATH`; returns undefined when none is found, letting the
 * SDK fall back to its managed browser.
 */
export function realChromeExecutable(): string | undefined {
  const fromEnv = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (fromEnv) return fromEnv;
  return (DEFAULT_CHROME_PATHS[process.platform] ?? []).find((path) => existsSync(path));
}

export interface AcquiredSession {
  session: BrowserSession;
  /** False for a connected (user-owned) browser, so callers do not close it. */
  owned: boolean;
}

/**
 * Returns a browser session, preferring a real user-run Chrome when one is
 * exposed for control.
 *
 * Set `BROWSER_AGENT_CDP_URL` to attach to a Chrome you launched yourself with
 * `--remote-debugging-port` (e.g. `http://127.0.0.1:9222` or the full
 * `ws://…/devtools/browser/…`). That browser carries your real fingerprint and
 * existing logins (Google, SEEK), which automation-launched Chromium does not —
 * sites like Google block sign-in on the latter.
 *
 * When the env var is unset, falls back to launching a managed browser.
 */
export async function acquireBrowserSession(
  launchOptions: LaunchOptions,
): Promise<AcquiredSession> {
  const cdp = process.env.BROWSER_AGENT_CDP_URL?.trim();
  if (cdp) {
    const wsUrl = await resolveCdpWsUrl(cdp);
    logInfo("browser connect via cdp", { wsUrl });
    const session = await BrowserSession.connect(wsUrl, {
      profile: { reconnectOnDisconnect: false },
    });
    return { session, owned: false };
  }
  return { session: await BrowserSession.launch(launchOptions), owned: true };
}

/** Accepts a ws URL as-is, or resolves an http host:port via `/json/version`. */
async function resolveCdpWsUrl(cdp: string): Promise<string> {
  if (cdp.startsWith("ws://") || cdp.startsWith("wss://")) return cdp;
  const base = cdp.startsWith("http") ? cdp : `http://${cdp}`;
  const res = await fetch(new URL("/json/version", base));
  const data = (await res.json()) as { webSocketDebuggerUrl?: string };
  if (!data.webSocketDebuggerUrl) {
    throw new Error(`No webSocketDebuggerUrl at ${base}/json/version`);
  }
  return data.webSocketDebuggerUrl;
}
