/**
 * Semantic answer keys and the heuristic that maps a form field's human label
 * to one of them. This is the single source of truth shared by seeding (which
 * writes answers under these keys) and the fill planner (which looks them up by
 * classifying each extracted field's label).
 *
 * Live form labels are noisy, so matching is keyword-based and order-sensitive:
 * more specific patterns are checked before broader ones.
 */
export type SemanticKey =
  | "right_to_work_au"
  | "visa_detail"
  | "citizenship"
  | "full_name"
  | "years_experience"
  | "salary_expectation"
  | "notice_period"
  | "availability"
  | "motivation";

interface Matcher {
  key: SemanticKey;
  /** All keywords must appear in the lowercased label. */
  all: string[];
}

/**
 * Ordered most-specific-first. "right to work" is checked before "citizen" and
 * "visa" because SEEK's work-rights question mentions all three.
 */
const MATCHERS: Matcher[] = [
  { key: "right_to_work_au", all: ["right to work"] },
  { key: "right_to_work_au", all: ["eligible to work"] },
  { key: "right_to_work_au", all: ["work rights"] },
  { key: "notice_period", all: ["notice period"] },
  { key: "notice_period", all: ["notice"] },
  // Availability / start date, before the broad "experience" rule.
  { key: "availability", all: ["available", "start"] },
  { key: "availability", all: ["start date"] },
  { key: "availability", all: ["availability"] },
  { key: "years_experience", all: ["years", "experience"] },
  { key: "salary_expectation", all: ["salary"] },
  { key: "salary_expectation", all: ["expected", "remuneration"] },
  { key: "visa_detail", all: ["visa"] },
  { key: "citizenship", all: ["citizen"] },
  // Open-ended motivation questions ("why do you want this role / job / position").
  { key: "motivation", all: ["why", "role"] },
  { key: "motivation", all: ["why", "job"] },
  { key: "motivation", all: ["why", "position"] },
  { key: "motivation", all: ["why", "company"] },
  { key: "full_name", all: ["name"] },
];

/** Maps a field label to a semantic answer key, or null when none applies. */
export function classifyField(label: string): SemanticKey | null {
  const text = label.toLowerCase();
  for (const matcher of MATCHERS) {
    if (matcher.all.every((token) => text.includes(token))) return matcher.key;
  }
  return null;
}

/**
 * Resolves the store key for a field label: its semantic key when classified,
 * otherwise a slug of the label. Lookups and writes share this so an
 * agent-drafted answer to an unclassified question is reused on the next apply.
 */
export function questionKeyFor(label: string): string {
  return classifyField(label) ?? slugify(label);
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "question"
  );
}
