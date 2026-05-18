import { ArrowRight } from "lucide-react";
import type { CoachClaim, CoachSuggestion } from "@jobseeker/contracts";

interface SuggestionsPanelProps {
  claim: CoachClaim | null;
  suggestions: CoachSuggestion[];
}

export function SuggestionsPanel({ claim, suggestions }: SuggestionsPanelProps) {
  if (!claim) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Select a claim to see suggestions.</div>
    );
  }

  const filtered = suggestions.filter((s) => s.claimId === claim.id);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Suggestions for
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{claim.text}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suggestions for this claim.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((suggestion) => (
            <li
              key={suggestion.id}
              className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm"
            >
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="text-foreground">{suggestion.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
