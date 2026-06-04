/**
 * Trims job-board chrome (nav, apply buttons, footer, "featured jobs" rails)
 * out of a crawled job page's text so only the description itself is stored.
 * Site-agnostic: markers that don't appear leave the text untouched, so it is
 * safe to run on already-clean text (idempotent).
 */

/** A line equal to one of these (or starting with it) begins page-footer junk. */
const TAIL_MARKERS = [
  "employer questions",
  "report this job",
  "be careful",
  "don’t provide your bank",
  "don't provide your bank",
  "featured jobs",
  "what can i earn",
  "job seekers",
  "seek sites",
];

/**
 * The last of these inside the leading chunk marks the end of page-header
 * chrome (search nav, apply/save buttons); the description follows it.
 */
const HEAD_MARKERS = ["quick apply", "apply now", "save", "posted", "employer site"];

/** How many leading lines may be header chrome. */
const HEAD_WINDOW = 60;

export function extractJobDescription(raw: string): string {
  const lines = raw.split("\n").map((line) => line.trim());

  // Cut the tail at the first footer marker.
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].toLowerCase();
    if (TAIL_MARKERS.some((marker) => line.startsWith(marker))) {
      end = i;
      break;
    }
  }

  // Cut the head after the last header marker within the head window.
  let start = 0;
  const window = Math.min(HEAD_WINDOW, end);
  for (let i = 0; i < window; i += 1) {
    const line = lines[i].toLowerCase();
    if (HEAD_MARKERS.some((marker) => line === marker || line.startsWith(`${marker} `))) {
      start = i + 1;
    }
  }

  const cleaned = lines
    .slice(start, end)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If the heuristics gutted the text, fall back to the raw input — a wrong
  // cut must never destroy the description.
  return cleaned.length >= 200 || cleaned.length >= raw.trim().length / 2 ? cleaned : raw.trim();
}
