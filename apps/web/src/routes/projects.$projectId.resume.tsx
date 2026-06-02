import { createFileRoute, redirect } from "@tanstack/react-router";

// The resume page merged into the unified Resume Studio (the coach route).
// Keep this path working by redirecting any existing links/bookmarks there.
export const Route = createFileRoute("/projects/$projectId/resume")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/coach", params });
  },
});
