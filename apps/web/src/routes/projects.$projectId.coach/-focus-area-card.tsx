import { AlertTriangle, CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import type { CoachClaim, CoachClaimStatus, CoachReview } from "@jobseeker/contracts";

import { Button } from "@/components/ui/button";

interface FocusAreaCardProps {
  review: CoachReview;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
  onRunDeepReview: () => void;
  deepRunning: boolean;
}

export function FocusAreaCard({
  review,
  selectedClaimId,
  onSelectClaim,
  onRunDeepReview,
  deepRunning,
}: FocusAreaCardProps) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Focus area
          </p>
          <h2 className="truncate text-base font-semibold text-foreground">{review.focusArea}</h2>
        </div>
        <div className="flex items-center gap-3 whitespace-nowrap text-sm">
          <span className="font-semibold text-foreground">{review.score.toFixed(1)} / 10</span>
          {review.issuesCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <AlertTriangle className="size-4" />
              {review.issuesCount} issue{review.issuesCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <Button size="sm" variant="outline" onClick={onRunDeepReview} disabled={deepRunning}>
            <Wand2 className="mr-1 size-4" />
            {deepRunning ? "Running…" : "Deep review"}
          </Button>
        </div>
      </header>

      <ol className="mt-4 space-y-2">
        {review.claims.map((claim) => (
          <li key={claim.id}>
            <ClaimRow
              claim={claim}
              selected={claim.id === selectedClaimId}
              onSelect={() => onSelectClaim(claim.id)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClaimRow({
  claim,
  selected,
  onSelect,
}: {
  claim: CoachClaim;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
        selected ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted"
      }`}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={claim.status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">{claim.text}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusLabel(claim.status)} — {claim.statusReason}
          </p>
        </div>
      </div>
    </button>
  );
}

function StatusIcon({ status }: { status: CoachClaimStatus }) {
  if (status === "strong") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
  }
  if (status === "needs_impact") {
    return <Sparkles className="mt-0.5 size-4 shrink-0 text-sky-600" />;
  }
  return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />;
}

function statusLabel(status: CoachClaimStatus): string {
  if (status === "strong") return "Strong";
  if (status === "needs_impact") return "Needs impact";
  return "Weak evidence";
}
