import type { InsightCard as InsightCardType, QuestionCard } from "@jobseeker/contracts";
import { Lightbulb, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { InsightCardItem } from "./insight-card";

interface InsightSidebarProps {
  insights: InsightCardType[];
  legacyCards: QuestionCard[];
  onDismiss: (cardId: string) => void;
}

export function InsightSidebar({ insights, legacyCards, onDismiss }: InsightSidebarProps) {
  const [open, setOpen] = useState(true);

  const answeredLegacy = legacyCards.filter((c) => c.status === "answered");

  if (!open) {
    return (
      <div className="flex flex-col items-center border-l py-3 px-1">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
          <PanelRightOpen className="size-4" />
        </Button>
        {insights.length > 0 ? (
          <Badge variant="secondary" className="mt-2">
            {insights.length}
          </Badge>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l bg-muted/20">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Insights</h3>
          {insights.length > 0 ? <Badge variant="secondary">{insights.length}</Badge> : null}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 p-3">
        {insights.length === 0 && answeredLegacy.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Insights from your conversation will appear here.
          </p>
        ) : null}

        {insights.map((card) => (
          <InsightCardItem key={card.id} card={card} onDismiss={() => onDismiss(card.id)} />
        ))}

        {answeredLegacy.length > 0 ? (
          <>
            <div className="pt-2 pb-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                From earlier analysis
              </p>
            </div>
            {answeredLegacy.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border/50 bg-background/50 p-3 opacity-70"
              >
                <p className="text-sm font-medium">{card.title}</p>
                {card.sections.currentAnswer ? (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                    {card.sections.currentAnswer}
                  </p>
                ) : null}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
