import { useState } from "react";
import { useStore } from "@tanstack/react-form";

import type { StructuredProfile } from "@jobseeker/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { toEditableProfile, toStructuredProfile, type ProfileForm } from "./types";

// Raw view/edit of the whole profile as JSON. Mirrors the form both ways:
// shows the current StructuredProfile, and "Apply" parses edited JSON back into
// the form (so Save persists it). Validation is deferred to Apply.
export function JsonEditor({ form }: { form: ProfileForm }) {
  const current = useStore(form.store, (state) =>
    JSON.stringify(toStructuredProfile(state.values), null, 2),
  );
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const dirty = draft !== current;

  const apply = () => {
    let parsed: StructuredProfile;
    try {
      parsed = JSON.parse(draft) as StructuredProfile;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON.");
      return;
    }
    try {
      form.reset(toEditableProfile(parsed));
      setError(null);
    } catch {
      setError("JSON parsed, but its shape doesn't match a profile.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Raw profile JSON. Edit and Apply to load it into the form, then Save.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setDraft(current);
              setError(null);
            }}
          >
            Reset
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!dirty} onClick={apply}>
            Apply
          </Button>
        </div>
      </div>

      <Textarea
        aria-label="Profile JSON"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        rows={28}
        className="font-mono text-xs"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
