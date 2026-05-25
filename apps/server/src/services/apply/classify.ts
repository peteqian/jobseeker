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
  | "salary_expectation";

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
  { key: "years_experience", all: ["years", "experience"] },
  { key: "salary_expectation", all: ["salary"] },
  { key: "salary_expectation", all: ["expected", "remuneration"] },
  { key: "visa_detail", all: ["visa"] },
  { key: "citizenship", all: ["citizen"] },
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
