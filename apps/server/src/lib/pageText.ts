/** Minimal structural view of an SDK page — just what text extraction needs. */
interface EvaluatablePage {
  evaluate<T>(script: string): Promise<T>;
}

/**
 * Reads the visible body text of the current page. Shared by the apply fit
 * judge and the explorer match pass so both extract job text the same way.
 * Returns "" on failure rather than throwing — callers treat empty as "no text".
 */
export async function extractBodyText(page: EvaluatablePage): Promise<string> {
  return page.evaluate<string>("document.body.innerText").catch(() => "");
}
