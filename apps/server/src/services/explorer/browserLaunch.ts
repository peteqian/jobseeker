import { existsSync } from "node:fs";

import { realChromeExecutable } from "../../lib/browserSession";
import { browserProfileDir } from "../../lib/paths";

/** Launch settings for the normal explorer attempt. */
export function getLaunchOptions() {
  const userDataDir = browserProfileDir();
  const extensionPaths = readExtensionPathsFromEnv();
  return {
    channel: (process.env.EXPLORER_BROWSER_CHANNEL as "chrome" | "chromium" | "msedge") ?? "chrome",
    headless: process.env.EXPLORER_HEADLESS === "true",
    userDataDir,
    proxyServer: process.env.EXPLORER_PROXY_SERVER,
    proxyBypass: process.env.EXPLORER_PROXY_BYPASS,
    userAgent: process.env.EXPLORER_USER_AGENT,
    acceptLanguage: process.env.EXPLORER_ACCEPT_LANGUAGE,
    locale: process.env.EXPLORER_LOCALE,
    timezoneId: process.env.EXPLORER_TIMEZONE,
    extensionPaths,
    fingerprintMode: "native",
    executablePath: realChromeExecutable(),
    autoInstallBrowser: true,
  } as const;
}

/**
 * Launch settings for the retry attempt after an anti-bot interstitial is
 * detected. Reuses the SAME persistent profile as the primary attempt so any
 * sign-in carries over — a separate retry profile would drop the login.
 */
export function getRetryLaunchOptions() {
  const userDataDir = browserProfileDir();
  const extensionPaths = readExtensionPathsFromEnv();
  return {
    channel: (process.env.EXPLORER_BROWSER_CHANNEL as "chrome" | "chromium" | "msedge") ?? "chrome",
    headless: false,
    userDataDir,
    proxyServer: process.env.EXPLORER_PROXY_SERVER,
    proxyBypass: process.env.EXPLORER_PROXY_BYPASS,
    userAgent: process.env.EXPLORER_USER_AGENT,
    acceptLanguage: process.env.EXPLORER_ACCEPT_LANGUAGE,
    locale: process.env.EXPLORER_LOCALE,
    timezoneId: process.env.EXPLORER_TIMEZONE,
    extensionPaths,
    fingerprintMode: "native",
    executablePath: realChromeExecutable(),
    autoInstallBrowser: true,
  } as const;
}

/** Reads optional unpacked browser extensions from the environment. */
function readExtensionPathsFromEnv(): string[] {
  const raw = process.env.EXPLORER_EXTENSION_PATHS;
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && existsSync(value));
}

/** Recognizes common anti-bot/interstitial page summaries from agent output. */
export function isBotInterstitial(summary: string): boolean {
  const text = summary.toLowerCase();
  return (
    text.includes("just a moment") ||
    text.includes("anti-bot") ||
    text.includes("captcha") ||
    text.includes("challenge")
  );
}

/**
 * True only for a genuine auth/credential failure — a dead, expired, or reused
 * Codex token. These are the only failures that warrant asking the user to
 * re-authenticate. A generic Codex crash (non-zero exit, rate limit, transient
 * model error) is NOT auth and must not match, or every hiccup misreports as a
 * login problem.
 */
export function isAuthFailure(summary: string): boolean {
  const text = summary.toLowerCase();
  return (
    text.includes("refresh_token") ||
    text.includes("token_expired") ||
    text.includes("invalidated") ||
    text.includes("unauthorized") ||
    text.includes("re-authenticate") ||
    text.includes("sign in again")
  );
}

/**
 * True when the failure comes from the model layer (Codex CLI exited, a model
 * decision error, or an auth problem) rather than a page state.
 *
 * Such a summary echoes the full prompt — which itself contains words like
 * "captcha" and "challenge" — and would otherwise false-positive
 * `isBotInterstitial` and trigger a pointless browser-respawn retry. Detect it
 * and skip the retry: relaunching the browser cannot fix a model-side failure.
 */
export function isModelInfraFailure(summary: string): boolean {
  const text = summary.toLowerCase();
  return (
    isAuthFailure(summary) ||
    text.includes("model decision failed") ||
    text.includes("codex exited")
  );
}
