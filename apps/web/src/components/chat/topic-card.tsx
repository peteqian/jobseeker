import type { TopicFileMeta } from "@jobseeker/contracts";
import { CheckCircle, Loader } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface TopicCardProps {
  topic: TopicFileMeta;
  selected: boolean;
  onClick: () => void;
}

export function TopicCard({ topic, selected, onClick }: TopicCardProps) {
  const done = topic.status === "complete";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border/50 bg-background/50 hover:border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate">{topic.title}</p>
        <Badge variant={done ? "success" : "warning"} className="shrink-0">
          {done ? <CheckCircle className="size-3" /> : <Loader className="size-3" />}
          {done ? "Done" : "Open"}
        </Badge>
      </div>
    </button>
  );
}
