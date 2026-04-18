import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeader } from "@/providers/shell-header-context";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});

const ACTIVITY_HEADER = {
  title: "Activity",
  description: "Track the latest orchestration events, document generation, and discovery runs.",
};

function ActivityPage() {
  useShellHeader(ACTIVITY_HEADER);
  const { allEvents, refreshAllEvents, projects } = useJobseeker();

  useEffect(() => {
    void refreshAllEvents();
  }, [refreshAllEvents]);

  const projectTitles = useMemo(
    () => new Map(projects.map((project) => [project.project.id, project.project.title])),
    [projects],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {allEvents.length === 0 ? (
          <Card className="bg-muted/30 shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">No events yet.</CardContent>
          </Card>
        ) : (
          allEvents.map((event) => (
            <Card key={event.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{event.type}</Badge>
                  <Badge variant="outline">
                    {projectTitles.get(event.projectId) ?? event.projectId}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <pre className="mt-4 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
