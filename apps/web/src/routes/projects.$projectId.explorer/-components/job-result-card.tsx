import { Trash2, ExternalLink, ChevronDown, FileText, Mail, Sparkles, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JobResultCardProps } from "../-explorer.types";
import { getMatchTier } from "./types";

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
}: JobResultCardProps & {
  generatingResume: boolean;
  generatingCoverLetter: boolean;
}) {
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
            {match ? (
              <Badge variant={getMatchTier(match.score).variant} className="shrink-0 text-xs">
                {getMatchTier(match.score).label} · {(match.score * 100).toFixed(0)}%
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

      {job.summary ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{job.summary}</p>
      ) : null}

      {match && (match.reasons.length > 0 || match.gaps.length > 0) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.reasons.slice(0, 2).map((reason) => (
            <Badge key={reason} variant="secondary" className="text-xs">
              {reason}
            </Badge>
          ))}
          {match.gaps.slice(0, 1).map((gap) => (
            <Badge key={gap} variant="outline" className="text-xs">
              gap: {gap}
            </Badge>
          ))}
        </div>
      ) : null}

      <div
        className="mt-4 flex items-center justify-between border-t pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="default" size="sm" disabled={isGenerating} />}
          >
            {isGenerating ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 mr-1.5" />
            )}
            {generateLabel}
            {!isGenerating && <ChevronDown className="size-3 ml-1.5" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[12rem]">
            <DropdownMenuItem
              onClick={() => onGenerate("resume_tailoring")}
              disabled={isGenerating}
              className="whitespace-nowrap"
            >
              <FileText className="size-4 mr-2" />
              Resume
              {hasResume && <span className="ml-2 text-xs text-muted-foreground">(ready)</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onGenerate("cover_letter_tailoring")}
              disabled={isGenerating}
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
              disabled={isGenerating}
              className="whitespace-nowrap"
            >
              <Sparkles className="size-4 mr-2" />
              Both
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
