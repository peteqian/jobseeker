import type {
  TailoringReview,
  TailoringReviewHistoryEntry,
  TailoringShortlist,
} from "@jobseeker/contracts";

import { Badge } from "@/components/ui/badge";

function severityClass(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-destructive/10 text-destructive";
    case "medium":
      return "bg-amber-500/10 text-amber-600";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function scoreClass(score: number, target: number): string {
  if (score >= target) return "";
  return score >= target - 20 ? "text-amber-600" : "text-destructive";
}

const SHORTLIST_LABELS: Record<TailoringShortlist, { label: string; className: string }> = {
  strong_yes: { label: "Would shortlist", className: "bg-emerald-500/10 text-emerald-600" },
  yes: { label: "Likely shortlist", className: "bg-emerald-500/10 text-emerald-600" },
  maybe: { label: "Borderline", className: "bg-amber-500/10 text-amber-600" },
  no: { label: "Would pass", className: "bg-destructive/10 text-destructive" },
};

/**
 * Latest recruiter verdict for a tailored document. Two separate judgments,
 * the way a real screen works: presentation (how well the document sells the
 * real background — editable) and fit (candidate vs role — informs job choice,
 * with the gaps explaining why). Shared by the document editor and the
 * explorer job detail pane.
 */
export function RecruiterReviewPanel({
  review,
  history,
  title = "Recruiter review",
}: {
  review: TailoringReview;
  history?: TailoringReviewHistoryEntry[];
  title?: string;
}) {
  const shortlist = review.shortlist ? SHORTLIST_LABELS[review.shortlist] : null;
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Badge
          variant={review.score >= 90 ? "default" : "outline"}
          className={review.score >= 90 ? "" : scoreClass(review.score, 90)}
        >
          Document {review.score}/100
        </Badge>
        {review.fitScore !== null ? (
          <Badge variant="outline" className={scoreClass(review.fitScore, 85)}>
            Job fit {review.fitScore}/100
          </Badge>
        ) : null}
        {shortlist ? (
          <span
            className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${shortlist.className}`}
          >
            {shortlist.label}
          </span>
        ) : null}
      </div>
      {review.gaps.length > 0 ? (
        <div className="mb-2.5 rounded-md border border-dashed p-2.5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Fit gaps — facts about you vs this role; editing the document won't change them
          </p>
          <ul className="space-y-1 text-xs leading-relaxed text-foreground/80">
            {review.gaps.map((gap) => (
              <li key={gap} className="flex items-start gap-1.5">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0">{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {review.issues.length > 0 ? (
        <ul className="space-y-2.5 text-sm">
          {review.issues.map((issue) => (
            <li key={`${issue.severity}-${issue.issue}`} className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${severityClass(issue.severity)}`}
              >
                {issue.severity}
              </span>
              <span className="min-w-0">
                <span className="text-foreground/90">{issue.issue}</span>
                {issue.fix ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    Fix: {issue.fix}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No document issues — it presents your background as well as it can.
        </p>
      )}
      {history && history.length > 1 ? (
        <div className="mt-3 border-t pt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Score history</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {history.map((entry) => (
              <li key={entry.id}>
                {entry.score}
                {entry.fitScore !== null ? ` / fit ${entry.fitScore}` : ""} ·{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
