import type { JobMatch } from "@jobseeker/contracts";

/** Pipeline position of a job: the highest stage it has reached. */
export type JobStage = "found" | "matched" | "docs_ready" | "applied";

export const STAGE_ORDER: JobStage[] = ["found", "matched", "docs_ready", "applied"];

export const STAGE_META: Record<JobStage, { label: string; shortLabel: string }> = {
  found: { label: "Found", shortLabel: "Found" },
  matched: { label: "Matched", shortLabel: "Matched" },
  docs_ready: { label: "Docs ready", shortLabel: "Docs" },
  applied: { label: "Applied", shortLabel: "Applied" },
};

export interface JobStageContext {
  match: JobMatch | undefined;
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasApplication: boolean;
}

/**
 * Highest stage wins so every job lands in exactly one bucket:
 * applied > docs_ready (any tailored doc) > matched (exact/partial) > found
 * (pending or no_match — discovered but not yet qualified).
 */
export function deriveJobStage(ctx: JobStageContext): JobStage {
  if (ctx.hasApplication) return "applied";
  if (ctx.hasResume || ctx.hasCoverLetter) return "docs_ready";
  const level = ctx.match?.level;
  if (level === "exact" || level === "partial") return "matched";
  return "found";
}

export function computeStageCounts(stages: Iterable<JobStage>): Record<JobStage | "all", number> {
  const counts: Record<JobStage | "all", number> = {
    all: 0,
    found: 0,
    matched: 0,
    docs_ready: 0,
    applied: 0,
  };
  for (const stage of stages) {
    counts[stage] += 1;
    counts.all += 1;
  }
  return counts;
}
