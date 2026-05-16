/**
 * Job-search-specific shapes used by the explorer pipeline. These previously
 * lived in `@jobseeker/browser-agent` but were stripped to make that package
 * domain-agnostic. Per AGENTS.md guidance, downstream packages own their
 * domain types.
 */

/** A normalized job listing extracted by the agent or by replayed selectors. */
export interface FoundJob {
  title: string;
  company: string;
  location: string;
  url: string;
  summary: string;
  salary?: string;
}

/** One replayable browser step, with `${query}` placeholders when needed. */
export interface TrajectoryStep {
  name: string;
  paramsTemplate: Record<string, unknown>;
}

/** Selector-based recipe for extracting visible job listings from a page. */
export interface Extractor {
  listingSelector: string;
  fields: Record<string, { selector: string; attr?: string }>;
}

/** Minimal replay plan emitted once the agent reaches a stable results layout. */
export interface DistilledTrajectory {
  actions: TrajectoryStep[];
  extractor: Extractor;
}
