import { useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Terminal, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnalysisKind, AnalysisRuns } from "@/hooks/use-analysis-stream";

const LABELS: Record<AnalysisKind, string> = {
  coach: "Coach review",
  ats: "ATS analysis",
  hr: "HR analysis",
};
const ORDER: AnalysisKind[] = ["coach", "ats", "hr"];

interface AnalysisProgressProps {
  runs: AnalysisRuns;
}

/**
 * Per-analysis progress list. Each running/finished analysis is a row; clicking
 * one reveals the live codex stream — reasoning, tool runs, and the answer as
 * they arrive.
 */
export function AnalysisProgress({ runs }: AnalysisProgressProps) {
  const [open, setOpen] = useState<AnalysisKind | null>(null);
  const active = ORDER.filter((kind) => runs[kind]);
  if (active.length === 0) return null;

  return (
    <div className="divide-y overflow-hidden rounded-lg border">
      {active.map((kind) => {
        const run = runs[kind]!;
        const isOpen = open === kind;
        return (
          <div key={kind}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
              onClick={() => setOpen(isOpen ? null : kind)}
            >
              {run.status === "running" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : run.status === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="size-4 shrink-0 text-rose-600" />
              )}
              <span className="flex-1 text-sm font-medium">{LABELS[kind]}</span>
              {run.status === "running" ? (
                <span className="text-xs text-muted-foreground">
                  {run.answer.length || run.reasoning.length
                    ? `${run.answer.length + run.reasoning.length} chars…`
                    : "starting…"}
                </span>
              ) : run.status === "done" ? (
                typeof run.score === "number" ? (
                  <Badge variant="outline">{run.score}/10</Badge>
                ) : (
                  <Badge variant="outline">done</Badge>
                )
              ) : (
                <span className="max-w-48 truncate text-xs text-rose-600">
                  {run.reason ?? "failed"}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen ? (
              <div className="max-h-80 space-y-3 overflow-y-auto border-t bg-muted/20 px-4 py-3">
                {run.reasoning ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Reasoning
                    </p>
                    <p className="whitespace-pre-wrap text-xs italic leading-relaxed text-muted-foreground">
                      {run.reasoning}
                    </p>
                  </div>
                ) : null}
                {run.tools.length ? (
                  <div className="space-y-1">
                    {run.tools.map((tool, i) => (
                      <p key={i} className="flex items-center gap-1.5 font-mono text-xs">
                        <Terminal className="size-3 shrink-0" />
                        <span className="truncate">{tool}</span>
                      </p>
                    ))}
                  </div>
                ) : null}
                {run.answer ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Output
                    </p>
                    <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {run.answer}
                    </p>
                  </div>
                ) : null}
                {!run.reasoning && !run.answer && !run.tools.length ? (
                  <p className="text-xs text-muted-foreground">
                    {run.status === "running"
                      ? "Waiting for the model to start streaming…"
                      : "No stream was captured for this run."}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
