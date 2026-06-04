import { useMemo } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TailoringActivityList } from "@/components/tailoring-activity-list";
import {
  describeTailoringEvent,
  isTailoringEvent,
  type TailoringActivityItem,
  type TailoringEventPayload,
} from "@/lib/tailoring-activity";
import type { JobRecord, RuntimeEvent } from "@jobseeker/contracts";

export function TailoringActivityDrawer({
  open,
  onOpenChange,
  job,
  events,
  isGenerating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobRecord | undefined;
  events: RuntimeEvent[];
  isGenerating: boolean;
}) {
  // Events are chronological (oldest first); render the run top-down.
  const items = useMemo(() => {
    if (!job) return [];
    return events
      .filter((event) => {
        const payload = event.payload as TailoringEventPayload;
        return payload.jobId === job.id && isTailoringEvent(event);
      })
      .map(describeTailoringEvent)
      .filter((item): item is TailoringActivityItem => item !== null);
  }, [events, job]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Generation activity</SheetTitle>
          <SheetDescription>
            {job ? `${job.title} · ${job.company}` : "No job selected."}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <TailoringActivityList
            items={items}
            isGenerating={isGenerating}
            emptyMessage="No generation activity for this job yet."
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
