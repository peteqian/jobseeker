/** The explorer crawler stores this literal when a listing had no summary. */
const SUMMARY_PLACEHOLDER = "No summary provided.";

/** Job summary for display, or null when empty/placeholder so the UI can hide it. */
export function jobSummaryText(summary: string | null | undefined): string | null {
  const trimmed = summary?.trim();
  if (!trimmed || trimmed === SUMMARY_PLACEHOLDER) return null;
  return trimmed;
}
