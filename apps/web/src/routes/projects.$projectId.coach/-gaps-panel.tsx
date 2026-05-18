import { MessageSquarePlus, Target } from "lucide-react";
import type { CoachGap, CoachGapSeverity } from "@jobseeker/contracts";

import { Button } from "@/components/ui/button";

interface GapsPanelProps {
  gaps: CoachGap[];
  onStartChat: (gapId: string) => void;
  pendingGapId: string | null;
}

export function GapsPanel({ gaps, onStartChat, pendingGapId }: GapsPanelProps) {
  if (gaps.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No gaps yet. Run a deep review to surface HR-style feedback grounded in job descriptions.
      </div>
    );
  }

  return (
    <ul className="space-y-3 p-4">
      {gaps.map((gap) => (
        <li key={gap.id} className="rounded-md border bg-background p-3">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{gap.topic}</p>
                <SeverityBadge severity={gap.severity} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{gap.evidenceSummary}</p>
              <p className="mt-2 rounded bg-muted/40 p-2 text-xs italic text-foreground">
                “{gap.discussionSeed}”
              </p>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStartChat(gap.id)}
                  disabled={pendingGapId === gap.id}
                >
                  <MessageSquarePlus className="mr-1 size-4" />
                  {pendingGapId === gap.id ? "Opening…" : "Discuss in coach"}
                </Button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SeverityBadge({ severity }: { severity: CoachGapSeverity }) {
  const style =
    severity === "high"
      ? "bg-red-100 text-red-700"
      : severity === "med"
        ? "bg-amber-100 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style}`}>
      {severity}
    </span>
  );
}
