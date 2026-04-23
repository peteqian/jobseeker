import type { RuntimeEvent } from "@jobseeker/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiUrl, getProjectEvents } from "@/lib/api";
import { eventsKeys, projectsKeys } from "@/lib/query-keys";

export function useProjectEvents(projectId: string | null) {
  const queryClient = useQueryClient();
  const { data: events = [] } = useQuery({
    queryKey: projectId ? eventsKeys.project(projectId) : ["events", "project", "none"],
    queryFn: () => (projectId ? getProjectEvents(projectId) : Promise.resolve([])),
    enabled: projectId !== null,
    initialData: [] as RuntimeEvent[],
  });

  useEffect(() => {
    if (!projectId) {
      return undefined;
    }

    const source = new EventSource(apiUrl(`/api/projects/${projectId}/events/stream`));

    const types: RuntimeEvent["type"][] = [
      "project.created",
      "resume.uploaded",
      "explorer.updated",
      "task.started",
      "task.progress",
      "task.waiting_for_user",
      "task.completed",
      "task.failed",
      "document.created",
      "jobs.updated",
    ];

    const onEvent = (rawEvent: MessageEvent<string>) => {
      const event = JSON.parse(rawEvent.data) as RuntimeEvent;
      let isNew = false;
      queryClient.setQueryData<RuntimeEvent[]>(eventsKeys.project(projectId), (current = []) => {
        if (current.some((entry) => entry.id === event.id)) return current;
        isNew = true;
        return [event, ...current];
      });
      queryClient.setQueryData<RuntimeEvent[]>(eventsKeys.all(), (current = []) =>
        current.some((entry) => entry.id === event.id) ? current : [event, ...current],
      );
      if (!isNew) return;
      if (event.type !== "task.progress" && event.type !== "task.waiting_for_user") {
        void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
        void queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
      }
    };

    for (const type of types) {
      source.addEventListener(type, onEvent as EventListener);
    }

    source.onerror = () => source.close();

    return () => {
      source.close();
    };
  }, [queryClient, projectId]);

  return events;
}
