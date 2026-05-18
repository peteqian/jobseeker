import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import type { ResumeBannerProps } from "./projects.$projectId.coach/-coach.types";

export function ResumeBanner({ resumeDoc, activeThread, projectSlug }: ResumeBannerProps) {
  if (!resumeDoc) return null;

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="default">Active resume</Badge>
          <p className="truncate text-sm font-medium text-foreground">{resumeDoc.name}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Chat responses are grounded against this resume version.
          {activeThread ? ` Thread: ${activeThread.title}` : ""}
        </p>
      </div>

      <Link
        to="/projects/$projectId/resume"
        params={{ projectId: projectSlug }}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Manage resumes
      </Link>
    </div>
  );
}
