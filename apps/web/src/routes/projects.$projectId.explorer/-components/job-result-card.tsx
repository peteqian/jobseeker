import { Trash2, ExternalLink, ChevronDown, FileText, Mail, Sparkles, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { jobSummaryText } from "@/lib/job-display";
import { STAGE_META } from "@/lib/job-stage";
import type { JobResultCardProps } from "../-explorer.types";
import { getMatchLevelMeta } from "./types";

export function JobResultCard({
  job,
  match,
  isSelected,
  onSelect,
  onDelete,
  onGenerate,
  hasResume,
  hasCoverLetter,
  generatingResume,
  generatingCoverLetter,
  onShowActivity,
  stage,
}: JobResultCardProps & {
  generatingResume: boolean;
  generatingCoverLetter: boolean;
  onShowActivity: () => void;
}) {
  const summary = jobSummaryText(job.summary);
  const isGenerating = generatingResume || generatingCoverLetter;
  const generateLabel =
    generatingResume && generatingCoverLetter
      ? "Generating both..."
      : generatingResume
        ? "Generating resume..."
        : generatingCoverLetter
          ? "Generating cover letter..."
          : "Generate";

  return (
    <li
      className={`group rounded-lg border bg-background p-5 transition-colors cursor-pointer ${
        isSelected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 font-medium leading-snug line-clamp-2">{job.title}</h3>
            {job.expiredAt ? (
              <Badge variant="outline" className="shrink-0 text-xs text-destructive">
                Expired
              </Badge>
            ) : null}
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              {STAGE_META[stage].shortLabel}
            </Badge>
            {match ? (
              <Badge variant={getMatchLevelMeta(match.level).variant} className="shrink-0 text-xs">
                {match.level === "pending" ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : null}
                {getMatchLevelMeta(match.level).label}
                {match.level !== "pending" && match.score > 0 ? ` · ${match.score}` : ""}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{job.company}</span>
            <span aria-hidden>·</span>
            <span>{job.location}</span>
            {job.salary ? (
              <>
                <span aria-hidden>·</span>
                <span>{job.salary}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open listing"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {summary ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{summary}</p>
      ) : null}

      {match && (match.reasons.length > 0 || match.gaps.length > 0) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.reasons.slice(0, 2).map((reason) => (
            <Badge key={reason} variant="secondary" className="max-w-full text-xs" title={reason}>
              <span className="truncate">{reason}</span>
            </Badge>
          ))}
          {match.gaps.slice(0, 1).map((gap) => (
            <Badge key={gap} variant="outline" className="max-w-full text-xs" title={gap}>
              <span className="truncate">gap: {gap}</span>
            </Badge>
          ))}
        </div>
      ) : null}

      <div
        className="mt-4 flex items-center justify-between border-t pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        {isGenerating ? (
          // While generating, the button opens the activity drawer instead.
          <Button variant="default" size="sm" onClick={onShowActivity} title="View activity">
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            {generateLabel}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="default" size="sm" />}>
              <Sparkles className="size-3.5 mr-1.5" />
              {generateLabel}
              <ChevronDown className="size-3 ml-1.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              <DropdownMenuItem
                onClick={() => onGenerate("resume_tailoring")}
                className="whitespace-nowrap"
              >
                <FileText className="size-4 mr-2" />
                Resume
                {hasResume && <span className="ml-2 text-xs text-muted-foreground">(ready)</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onGenerate("cover_letter_tailoring")}
                className="whitespace-nowrap"
              >
                <Mail className="size-4 mr-2" />
                Cover Letter
                {hasCoverLetter && (
                  <span className="ml-2 text-xs text-muted-foreground">(ready)</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onGenerate("resume_tailoring");
                  onGenerate("cover_letter_tailoring");
                }}
                className="whitespace-nowrap"
              >
                <Sparkles className="size-4 mr-2" />
                Both
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete"
          className="size-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
