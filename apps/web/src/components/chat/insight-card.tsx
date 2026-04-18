import type { InsightCard } from "@jobseeker/contracts";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface InsightCardItemProps {
  card: InsightCard;
  onDismiss: () => void;
}

const categoryColors: Record<string, string> = {
  positioning: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  evidence: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reframing: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  gap: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export function InsightCardItem({ card, onDismiss }: InsightCardItemProps) {
  return (
    <div className="group rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={categoryColors[card.category] ?? categoryColors.other}
          >
            {card.category}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-2 text-sm font-medium">{card.title}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{card.body}</p>
    </div>
  );
}
