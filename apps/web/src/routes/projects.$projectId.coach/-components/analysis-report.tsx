import { useState } from "react";
import { ChevronDown, FileSearch, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AtsAnalysisReport, HrAnalysisReport } from "@/lib/api";

interface AnalysisReportProps {
  ats: AtsAnalysisReport | null;
  hr: HrAnalysisReport | null;
}

/** Color the 0-10 score: red below 5, amber to 7, green above. */
function scoreTone(score: number): string {
  if (score >= 7) return "text-success";
  if (score >= 5) return "text-warning";
  return "text-destructive";
}

export function AnalysisReport({ ats, hr }: AnalysisReportProps) {
  const [expanded, setExpanded] = useState(false);

  if (!ats && !hr) {
    return (
      <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        ATS and HR analysis run automatically after you add a resume. Results will appear here.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        {ats ? (
          <div className="flex items-center gap-2">
            <FileSearch className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">ATS</span>
            <span className={cn("text-lg font-semibold", scoreTone(ats.score))}>
              {ats.score}/10
            </span>
            <Badge variant="outline">{ats.issues.length} issues</Badge>
          </div>
        ) : null}

        {hr ? (
          <div className="flex items-center gap-2">
            <UserCheck className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">HR</span>
            <span className={cn("text-lg font-semibold", scoreTone(hr.score))}>{hr.score}/10</span>
            <Badge variant="outline">{hr.strengths.length} strengths</Badge>
            <Badge variant="outline">{hr.concerns.length} concerns</Badge>
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Hide report" : "View report"}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>

      {expanded ? (
        <div className="grid gap-4 border-t px-4 py-4 md:grid-cols-2">
          {ats ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">ATS — machine readability</h4>
              {ats.issues.length ? (
                <ul className="space-y-2 text-sm">
                  {ats.issues.map((issue, index) => (
                    <li key={index} className="rounded-md bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{issue.severity}</Badge>
                        <span className="text-xs text-muted-foreground">{issue.category}</span>
                      </div>
                      <p className="mt-1">{issue.description}</p>
                      <p className="mt-1 text-muted-foreground">Fix: {issue.fix}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No blocking issues found.</p>
              )}
              {ats.keywordGaps.length ? (
                <div className="flex flex-wrap gap-1">
                  {ats.keywordGaps.map((kw) => (
                    <Badge key={kw} variant="secondary">
                      {kw}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {hr ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">HR — hiring-manager read</h4>
              {hr.narrative ? <p className="text-sm">{hr.narrative}</p> : null}
              {hr.strengths.length ? (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Strengths</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {hr.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {hr.concerns.length ? (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Concerns</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {hr.concerns.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
