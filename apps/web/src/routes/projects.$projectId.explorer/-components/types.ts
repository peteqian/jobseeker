import type { MatchLevel } from "@jobseeker/contracts";

interface MatchLevelMeta {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  toneClass: string;
  /** Sort rank: lower sorts first (exact → partial → pending → no_match). */
  rank: number;
}

export function getMatchLevelMeta(level: MatchLevel): MatchLevelMeta {
  switch (level) {
    case "exact":
      return { label: "Exact match", variant: "default", toneClass: "text-emerald-600", rank: 0 };
    case "partial":
      return { label: "Partial match", variant: "secondary", toneClass: "text-amber-600", rank: 1 };
    case "pending":
      return {
        label: "Matching…",
        variant: "outline",
        toneClass: "text-muted-foreground",
        rank: 2,
      };
    case "no_match":
      return { label: "No match", variant: "outline", toneClass: "text-muted-foreground", rank: 3 };
  }
}
