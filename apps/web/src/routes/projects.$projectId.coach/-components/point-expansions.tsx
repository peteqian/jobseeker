import { useState } from "react";
import { MessageSquarePlus, Sparkles } from "lucide-react";
import type { CoachClaim, ProfilePointDetail } from "@jobseeker/contracts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PointExpansionsProps {
  claims: CoachClaim[];
  pointDetails: ProfilePointDetail[];
  selectedClaimId: string | null;
  onExpandClaim: (claimId: string) => void;
}

type Status = CoachClaim["status"];

const STATUS_LABEL: Record<Status, string> = {
  strong: "strong",
  weak: "weak",
  needs_impact: "needs impact",
};

// Weak/needs-impact earn color; strong stays neutral so red/amber mean "look here".
const STATUS_TONE: Record<Status, string> = {
  strong: "border-transparent bg-muted text-muted-foreground",
  weak: "border-destructive/30 bg-destructive/10 text-destructive",
  needs_impact: "border-warning/40 bg-warning/15 text-warning",
};

// Weakest first — the lines that need work float to where the eye lands.
const STATUS_ORDER: Record<Status, number> = { weak: 0, needs_impact: 1, strong: 2 };
const CHIP_ORDER: Status[] = ["weak", "needs_impact", "strong"];

/**
 * The unified "resume point ↔ expanded detail" view. Each coach claim is an
 * original resume line; once the interview expands it, the richer story and
 * draft bullet are shown beneath, with evidence the candidate gave. Sorted
 * weakest-first with status filter chips so a long list reads as a worklist.
 */
export function PointExpansions({
  claims,
  pointDetails,
  selectedClaimId,
  onExpandClaim,
}: PointExpansionsProps) {
  const [filter, setFilter] = useState<Status | null>(null);

  if (claims.length === 0) {
    return null;
  }

  const detailByClaim = new Map(pointDetails.filter((d) => d.claimId).map((d) => [d.claimId, d]));

  const counts = claims.reduce(
    (acc, c) => {
      acc[c.status] += 1;
      return acc;
    },
    { strong: 0, weak: 0, needs_impact: 0 } as Record<Status, number>,
  );

  const sorted = [...claims].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const visible = filter ? sorted.filter((c) => c.status === filter) : sorted;

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      {/* Count chips double as filters. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        {CHIP_ORDER.filter((status) => counts[status] > 0).map((status) => {
          const active = filter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(active ? null : status)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active
                  ? STATUS_TONE[status]
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {counts[status]} {STATUS_LABEL[status]}
            </button>
          );
        })}
        {filter ? (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Show all
          </button>
        ) : null}
      </div>

      <ul className="divide-y">
        {visible.map((claim) => {
          const detail = detailByClaim.get(claim.id);
          const isSelected = claim.id === selectedClaimId;

          return (
            <li key={claim.id} className={cn("px-4 py-3", isSelected && "bg-accent/30")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{claim.text}</p>
                  <span
                    className={cn(
                      "inline-block rounded border px-1.5 py-0.5 text-xs",
                      STATUS_TONE[claim.status],
                    )}
                  >
                    {STATUS_LABEL[claim.status]}
                  </span>
                </div>
                <Button
                  variant={detail ? "outline" : "secondary"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => onExpandClaim(claim.id)}
                >
                  <MessageSquarePlus className="size-4" />
                  {detail ? "Revisit" : "Sharpen"}
                </Button>
              </div>

              {detail ? (
                <div className="mt-3 space-y-2 rounded-md bg-muted/40 px-3 py-3 text-sm">
                  <p>{detail.expandedDetail}</p>
                  {detail.evidence.length ? (
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {detail.evidence.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.resumeAngle ? (
                    <p className="flex items-start gap-2 rounded bg-background px-2 py-1.5 font-medium">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-warning" />
                      {detail.resumeAngle}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
