import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileSkill } from "@jobseeker/contracts";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import { SKILL_DISPLAY_CAP, type ProfileForm } from "./types";

export function SkillsSection({
  form,
  skillDraft,
  setSkillDraft,
  addSkill,
}: {
  form: ProfileForm;
  skillDraft: string;
  setSkillDraft: (value: string) => void;
  addSkill: (value: string, category?: ProfileSkill["category"]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const query = skillDraft.trim().toLowerCase();

  return (
    <CollapsibleSection
      title="Skills"
      description="Pulled from your resume. Type to add or filter; Enter or comma to add."
      contentClassName="space-y-4"
    >
      <Input
        value={skillDraft}
        onChange={(event) => setSkillDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== ",") return;
          event.preventDefault();
          addSkill(skillDraft);
          setSkillDraft("");
        }}
        placeholder="Add or filter skills…"
      />

      <form.Field name="skills" mode="array">
        {(skillsField) => {
          const all = skillsField.state.value;
          if (all.length === 0) {
            return <p className="text-sm text-muted-foreground">No skills added yet.</p>;
          }

          const indexed = all.map((skill, index) => ({ skill, index }));
          const filtered = query
            ? indexed.filter(({ skill }) => skill.name.toLowerCase().includes(query))
            : indexed;
          const visible = query || showAll ? filtered : filtered.slice(0, SKILL_DISPLAY_CAP);
          const hidden = filtered.length - visible.length;

          return (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {visible.map(({ skill, index }) => (
                  <Badge
                    key={skill.name}
                    variant="secondary"
                    className="gap-1 py-1 pl-3 pr-1.5 text-sm"
                  >
                    {skill.name}
                    <button
                      type="button"
                      onClick={() => skillsField.removeValue(index)}
                      aria-label={`Remove ${skill.name}`}
                      className="-mr-0.5 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </Badge>
                ))}
                {query && filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No match. Press Enter to add “{skillDraft.trim()}”.
                  </p>
                ) : null}
              </div>

              {!query && hidden > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setShowAll(true)}
                >
                  Show all {all.length}
                </Button>
              ) : null}
              {!query && showAll && all.length > SKILL_DISPLAY_CAP ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setShowAll(false)}
                >
                  Show less
                </Button>
              ) : null}
            </div>
          );
        }}
      </form.Field>
    </CollapsibleSection>
  );
}
