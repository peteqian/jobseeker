import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import { coachKeys, projectsKeys } from "@/lib/query-keys";

export type AnalysisKind = "coach" | "ats" | "hr";
export type AnalysisStatus = "running" | "done" | "failed";

export interface AnalysisRun {
  kind: AnalysisKind;
  status: AnalysisStatus;
  /** Streamed model reasoning (codex only). */
  reasoning: string;
  /** Streamed answer text. */
  answer: string;
  /** Tool / command lines observed during the run. */
  tools: string[];
  score?: number;
  reason?: string;
}

export type AnalysisRuns = Partial<Record<AnalysisKind, AnalysisRun>>;

function empty(kind: AnalysisKind): AnalysisRun {
  return { kind, status: "running", reasoning: "", answer: "", tools: [] };
}

/**
 * Subscribes to the project's SSE stream and reconstructs each analysis run
 * live: status plus streamed reasoning / answer / tool lines. `analysis.delta`
 * events are ephemeral (never persisted), so this only reflects runs observed
 * while mounted — which is exactly when the user is watching.
 */
export function useAnalysisStream(projectId: string | null): AnalysisRuns {
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<AnalysisRuns>({});

  useEffect(() => {
    if (!projectId) return undefined;
    const source = new EventSource(apiUrl(`/api/projects/${projectId}/events/stream`));

    const onStarted = (e: MessageEvent<string>) => {
      const { payload } = JSON.parse(e.data) as { payload: { kind: AnalysisKind } };
      setRuns((prev) => ({ ...prev, [payload.kind]: empty(payload.kind) }));
    };

    const onDelta = (e: MessageEvent<string>) => {
      const { payload } = JSON.parse(e.data) as {
        payload: { kind: AnalysisKind; channel: "reasoning" | "message" | "tool"; text: string };
      };
      setRuns((prev) => {
        const run = prev[payload.kind] ?? empty(payload.kind);
        const next: AnalysisRun = { ...run };
        if (payload.channel === "reasoning") next.reasoning = run.reasoning + payload.text;
        else if (payload.channel === "message") next.answer = run.answer + payload.text;
        else next.tools = [...run.tools, payload.text];
        return { ...prev, [payload.kind]: next };
      });
    };

    const onCompleted = (e: MessageEvent<string>) => {
      const { payload } = JSON.parse(e.data) as {
        payload: { kind: AnalysisKind; score?: number };
      };
      setRuns((prev) => {
        const run = prev[payload.kind] ?? empty(payload.kind);
        return { ...prev, [payload.kind]: { ...run, status: "done", score: payload.score } };
      });
      // Results landed — refresh the persisted queries that feed the page.
      void queryClient.invalidateQueries({ queryKey: projectsKeys.resumeAnalyses(projectId) });
      void queryClient.invalidateQueries({ queryKey: coachKeys.review(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
    };

    const onFailed = (e: MessageEvent<string>) => {
      const { payload } = JSON.parse(e.data) as {
        payload: { kind: AnalysisKind; reason?: string };
      };
      setRuns((prev) => {
        const run = prev[payload.kind] ?? empty(payload.kind);
        return { ...prev, [payload.kind]: { ...run, status: "failed", reason: payload.reason } };
      });
    };

    source.addEventListener("analysis.started", onStarted as EventListener);
    source.addEventListener("analysis.delta", onDelta as EventListener);
    source.addEventListener("analysis.completed", onCompleted as EventListener);
    source.addEventListener("analysis.failed", onFailed as EventListener);

    return () => source.close();
  }, [projectId, queryClient]);

  return runs;
}
