import { existsSync } from "node:fs";
import path from "node:path";

import { dataDir } from "../../env";

/**
 * Builds a stable browser-profile key per `(domain, query)` pair so concurrent
 * runs do not fight over the same Chrome profile directory.
 */
export function buildQueryProfileKey(domain: string, query: string): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  const domainSlug = clean(domain) || "domain";
  const querySlug = clean(query) || "query";
  return `${domainSlug}-${querySlug}`;
}

/** Launch settings for the normal explorer attempt. */
export function getLaunchOptions(pairSlug: string) {
  const userDataDir = path.join(dataDir, "browser-profiles", `explorer-primary-${pairSlug}`);
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
    autoInstallBrowser: true,
  } as const;
}

/**
 * Launch settings for the retry attempt after an anti-bot interstitial is
 * detected.
 */
export function getRetryLaunchOptions(pairSlug: string) {
  const userDataDir = path.join(dataDir, "browser-profiles", `explorer-retry-${pairSlug}`);
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
