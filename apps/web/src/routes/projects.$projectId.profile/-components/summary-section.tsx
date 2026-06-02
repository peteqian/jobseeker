import { useStore } from "@tanstack/react-form";
import { CalendarClock, IdCard, User } from "lucide-react";

import { computeYearsOfExperience } from "@jobseeker/contracts";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import { type ProfileForm } from "./types";

export function SummarySection({ form }: { form: ProfileForm }) {
  // Suggested from work-history dates; the field stays editable so the user can
  // override (e.g. to count experience the dated roles don't capture).
  const derived = useStore(form.store, (state) =>
    computeYearsOfExperience(state.values.experiences),
  );

  return (
    <CollapsibleSection
      title="About"
      description="Who you are, your overview, and total experience."
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field name="identity.name">
            {(field) => (
              <InputGroup>
                <InputGroupAddon>
                  <User />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Full name"
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Full name"
                />
              </InputGroup>
            )}
          </form.Field>

          <form.Field name="identity.headline">
            {(field) => (
              <InputGroup>
                <InputGroupAddon>
                  <IdCard />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Headline"
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Headline, e.g. Full-Stack Software Engineer"
                />
              </InputGroup>
            )}
          </form.Field>
        </div>

        <form.Field name="identity.yearsOfExperience">
          {(field) => (
            <div className="flex items-center gap-3">
              <div className="w-44">
                <InputGroup>
                  <InputGroupAddon>
                    <CalendarClock />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Years of experience"
                    type="number"
                    min={0}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
                      )
                    }
                    placeholder={derived > 0 ? String(derived) : "0"}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>yrs</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              {derived > 0 && field.state.value !== derived ? (
                <button
                  type="button"
                  onClick={() => field.handleChange(derived)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Use calculated ({derived})
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {derived > 0 ? "Matches your work history." : "Calculated from work history."}
                </span>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="identity.summary">
          {(field) => (
            <Textarea
              aria-label="Summary"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="A short overview of who you are and what you bring…"
              rows={4}
            />
          )}
        </form.Field>
      </div>
    </CollapsibleSection>
  );
}
