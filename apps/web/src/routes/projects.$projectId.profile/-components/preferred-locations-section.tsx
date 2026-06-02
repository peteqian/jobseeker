import { MapPin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileLocation } from "@jobseeker/contracts";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import { createEmptyLocation, selectClassName, type ProfileForm } from "./types";

export function PreferredLocationsSection({ form }: { form: ProfileForm }) {
  return (
    <CollapsibleSection
      title="Preferred locations"
      description="Where do you want to work?"
      icon={<MapPin className="size-5 text-muted-foreground" />}
      contentClassName="space-y-3"
      action={
        <form.Field name="targeting.locations" mode="array">
          {(locationsField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => locationsField.pushValue(createEmptyLocation())}
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </form.Field>
      }
    >
      <form.Field name="targeting.locations" mode="array">
        {(locationsField) => (
          <>
            {locationsField.state.value.map((location, index) => (
              <div
                key={location._rowId}
                className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <LocationTextField
                  form={form}
                  name={`targeting.locations[${index}].city`}
                  placeholder="City"
                />
                <LocationTextField
                  form={form}
                  name={`targeting.locations[${index}].state`}
                  placeholder="State"
                />
                <form.Field name={`targeting.locations[${index}].remote` as const}>
                  {(field) => (
                    <select
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value as ProfileLocation["remote"])
                      }
                      className={selectClassName}
                    >
                      <option value="no">On-site</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="full">Remote</option>
                    </select>
                  )}
                </form.Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => locationsField.removeValue(index)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}

            {locationsField.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations added.</p>
            ) : null}
          </>
        )}
      </form.Field>
    </CollapsibleSection>
  );
}

function LocationTextField({
  form,
  name,
  placeholder,
}: {
  form: ProfileForm;
  name: `targeting.locations[${number}].city` | `targeting.locations[${number}].state`;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Input
          id={field.name}
          name={field.name}
          value={field.state.value ?? ""}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </form.Field>
  );
}
