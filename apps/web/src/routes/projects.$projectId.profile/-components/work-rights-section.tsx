import { useState } from "react";
import { useStore } from "@tanstack/react-form";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, countryName } from "@/lib/countries";
import type { WorkRightStatus } from "@jobseeker/contracts";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import {
  createEmptyWorkRight,
  selectClassName,
  WORK_RIGHT_OPTIONS,
  type ProfileForm,
} from "./types";

function CountryMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal text-muted-foreground"
            />
          }
        >
          <span>Add citizenship…</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search country…" />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.code}`}
                    data-checked={selected.includes(country.code) ? "true" : "false"}
                    onSelect={() => toggle(country.code)}
                  >
                    {country.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((code) => (
            <Badge key={code} variant="secondary" className="gap-1 pr-1">
              {countryName(code)}
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-label={`Remove ${countryName(code)}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className="w-full justify-between font-normal" />
        }
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value ? countryName(value) : "Select country…"}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.code}`}
                  data-checked={value === country.code ? "true" : "false"}
                  onSelect={() => {
                    onChange(country.code);
                    setOpen(false);
                  }}
                >
                  {country.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// One country's right to work: country → type → (visa detail). Visa detail only
// surfaces for temporary visas, so it reads its own status to decide.
function WorkRightRow({
  form,
  index,
  onRemove,
}: {
  form: ProfileForm;
  index: number;
  onRemove: () => void;
}) {
  const status = useStore(form.store, (state) => state.values.workRights.rights[index]?.status);
  const showVisaDetail = status === "work_visa" || status === "student_visa";

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <form.Field name={`workRights.rights[${index}].country` as const}>
            {(field) => (
              <div className="space-y-2">
                <Label>Country</Label>
                <CountrySelect
                  value={field.state.value}
                  onChange={(code) => field.handleChange(code)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name={`workRights.rights[${index}].status` as const}>
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Right to work</Label>
                <select
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value as WorkRightStatus)}
                  className={selectClassName}
                >
                  {WORK_RIGHT_OPTIONS.filter((option) => option.value !== "unspecified").map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}
          </form.Field>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      {showVisaDetail ? (
        <form.Field name={`workRights.rights[${index}].visaDetail` as const}>
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Visa detail</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. Subclass 482"
              />
            </div>
          )}
        </form.Field>
      ) : null}
    </div>
  );
}

export function WorkRightsSection({ form }: { form: ProfileForm }) {
  return (
    <CollapsibleSection
      title="Work rights"
      description="Where you can legally work. Used to answer application screening questions — nothing is submitted without your review."
      contentClassName="space-y-6"
      action={
        <form.Field name="workRights.rights" mode="array">
          {(rightsField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rightsField.pushValue(createEmptyWorkRight())}
            >
              <Plus className="size-4" />
              Add country
            </Button>
          )}
        </form.Field>
      }
    >
      <form.Field name="workRights.rights" mode="array">
        {(rightsField) => (
          <div className="space-y-3">
            {rightsField.state.value.map((entry, index) => (
              <WorkRightRow
                key={entry._rowId}
                form={form}
                index={index}
                onRemove={() => rightsField.removeValue(index)}
              />
            ))}

            {rightsField.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No work rights added. Add the countries where you can work.
              </p>
            ) : null}
          </div>
        )}
      </form.Field>

      <form.Field name="workRights.citizenship">
        {(field) => (
          <div className="space-y-2 border-t pt-6">
            <Label>Citizenship</Label>
            <CountryMultiSelect
              selected={field.state.value}
              onChange={(next) => field.handleChange(next)}
            />
          </div>
        )}
      </form.Field>
    </CollapsibleSection>
  );
}
