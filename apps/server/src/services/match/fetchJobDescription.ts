import type { BrowserSession } from "@peteqian/browser-agent-sdk";

import { extractBodyText } from "../../lib/pageText";
import { logWarn } from "../../lib/log";

/**
 * Opens one job URL in the given (headless) session and returns its visible
 * text, truncated to the match judge's window. Returns null on any failure
 * (anti-bot, dead link, timeout) so the caller can fall back to the listing
 * summary instead of dropping the job.
 *
 * The session is owned by the caller (the match pass launches one and reuses it
 * across jobs); this only opens and closes a page.
 */
export async function fetchJobDescription(
  session: BrowserSession,
  url: string,
): Promise<string | null> {
  let page: Awaited<ReturnType<BrowserSession["newPage"]>> | null = null;
  try {
    page = await session.newPage();
    await page.goto(url);
    await page.waitForStablePage(3_000).catch(() => {});
    const text = (await extractBodyText(page)).trim();
    return text.length > 0 ? text.slice(0, 12_000) : null;
  } catch (error) {
    logWarn("match jd fetch failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}
