import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { STAGE_META, STAGE_ORDER, type JobStage } from "@/lib/job-stage";

/**
 * Pipeline header: each segment is a filter showing how many jobs sit at that
 * stage (highest reached). "All" clears the filter.
 */
export function StageRail({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<JobStage | "all", number>;
  selected: JobStage | "all";
  onSelect: (stage: JobStage | "all") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={selected === "all" ? "default" : "outline"}
        className="h-8"
        onClick={() => onSelect("all")}
      >
        All {counts.all}
      </Button>
      <span aria-hidden className="mx-1 text-muted-foreground/50">
        ·
      </span>
      {STAGE_ORDER.map((stage, index) => (
        <Fragment key={stage}>
          {index > 0 ? (
            <ChevronRight aria-hidden className="size-3.5 text-muted-foreground/50" />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={selected === stage ? "default" : "outline"}
            className="h-8"
            onClick={() => onSelect(stage)}
          >
            {STAGE_META[stage].label} {counts[stage]}
          </Button>
        </Fragment>
      ))}
    </div>
  );
}
