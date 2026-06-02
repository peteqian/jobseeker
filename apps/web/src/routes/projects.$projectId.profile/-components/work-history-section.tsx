import { type ReactNode, useState } from "react";
import { useStore } from "@tanstack/react-form";
import { Briefcase, Building2, Calendar as CalendarIcon, Plus, Tags, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import { createEmptyExperience, type ProfileForm } from "./types";

function monthValueToDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function dateToMonthValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Month/year picker over the shadcn Calendar. Stores "YYYY-MM"; any picked day
// is normalized to its month. Dropdown caption makes month/year the fast path.
function MonthPicker({
  id,
  value,
  onChange,
  placeholder = "Pick month",
}: {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = monthValueToDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            id={id}
            variant="outline"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected
            ? selected.toLocaleString(undefined, { month: "short", year: "numeric" })
            : placeholder}
        </span>
        <CalendarIcon className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(1980, 0)}
          endMonth={new Date()}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? dateToMonthValue(date) : undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// Start/end months for one experience. End is replaced by "Present" while the
// role is current; toggling current on clears any end date.
function WorkHistoryDates({ form, index }: { form: ProfileForm; index: number }) {
  const isCurrent = useStore(
    form.store,
    (state) => state.values.experiences[index]?.isCurrent ?? false,
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <form.Field name={`experiences[${index}].startDate` as const}>
          {(field) => (
            <MonthPicker
              id={field.name}
              value={field.state.value}
              onChange={(next) => field.handleChange(next)}
              placeholder="Start month"
            />
          )}
        </form.Field>

        <form.Field name={`experiences[${index}].endDate` as const}>
          {(field) =>
            isCurrent ? (
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                Present
              </div>
            ) : (
              <MonthPicker
                id={field.name}
                value={field.state.value}
                onChange={(next) => field.handleChange(next)}
                placeholder="End month"
              />
            )
          }
        </form.Field>
      </div>

      <form.Field name={`experiences[${index}].isCurrent` as const}>
        {(currentField) => (
          <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={currentField.state.value ?? false}
              onCheckedChange={(checked) => {
                const next = Boolean(checked);
                currentField.handleChange(next);
                if (next) form.setFieldValue(`experiences[${index}].endDate`, undefined);
              }}
              aria-label="Mark as current role"
            />
            Current role
          </label>
        )}
      </form.Field>
    </div>
  );
}

export function WorkHistorySection({ form }: { form: ProfileForm }) {
  return (
    <CollapsibleSection
      title="Work history"
      description="Roles and achievements extracted from your resume. Edit details or add missing entries."
      contentClassName="space-y-4"
      action={
        <form.Field name="experiences" mode="array">
          {(experiencesField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => experiencesField.pushValue(createEmptyExperience())}
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </form.Field>
      }
    >
      <form.Field name="experiences" mode="array">
        {(experiencesField) => (
          <>
            {experiencesField.state.value.map((experience, index) => (
              <div key={experience.id} className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ExperienceTextField
                        form={form}
                        name={`experiences[${index}].company`}
                        icon={<Building2 />}
                        placeholder="Company"
                      />
                      <ExperienceTextField
                        form={form}
                        name={`experiences[${index}].title`}
                        icon={<Briefcase />}
                        placeholder="Title"
                      />
                    </div>
                    <WorkHistoryDates form={form} index={index} />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => experiencesField.removeValue(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>

                <form.Field name={`experiences[${index}].achievements` as const}>
                  {(field) => (
                    <Textarea
                      aria-label="Achievements, one per line"
                      value={field.state.value.join("\n")}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value
                            .split("\n")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="Achievements, one per line — e.g. Led migration to TypeScript, cutting bugs 30%"
                      rows={3}
                    />
                  )}
                </form.Field>

                <form.Field name={`experiences[${index}].skillsUsed` as const}>
                  {(field) => (
                    <InputGroup>
                      <InputGroupAddon>
                        <Tags />
                      </InputGroupAddon>
                      <InputGroupInput
                        aria-label="Skills used"
                        value={field.state.value.join(", ")}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(
                            event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="Skills used, comma separated"
                      />
                    </InputGroup>
                  )}
                </form.Field>
              </div>
            ))}

            {experiencesField.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">No experience entries yet.</p>
            ) : null}
          </>
        )}
      </form.Field>
    </CollapsibleSection>
  );
}

function ExperienceTextField({
  form,
  name,
  icon,
  placeholder,
}: {
  form: ProfileForm;
  name: `experiences[${number}].company` | `experiences[${number}].title`;
  icon: ReactNode;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <InputGroup>
          <InputGroupAddon>{icon}</InputGroupAddon>
          <InputGroupInput
            aria-label={placeholder}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder={placeholder}
          />
        </InputGroup>
      )}
    </form.Field>
  );
}
