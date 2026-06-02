import { Building2, Calendar, GraduationCap, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import { createEmptyEducation, type ProfileForm } from "./types";

// One qualification: degree + field, institution, and study period.
export function EducationSection({ form }: { form: ProfileForm }) {
  return (
    <CollapsibleSection
      title="Education"
      description="Degrees, diplomas, and certifications. Edit details or add missing entries."
      contentClassName="space-y-4"
      defaultOpen={false}
      action={
        <form.Field name="education" mode="array">
          {(educationField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => educationField.pushValue(createEmptyEducation())}
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </form.Field>
      }
    >
      <form.Field name="education" mode="array">
        {(educationField) => (
          <>
            {educationField.state.value.map((edu, index) => (
              <div key={edu.id} className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <form.Field name={`education[${index}].degree` as const}>
                      {(field) => (
                        <InputGroup>
                          <InputGroupAddon>
                            <GraduationCap />
                          </InputGroupAddon>
                          <InputGroupInput
                            aria-label="Degree"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="Degree, e.g. Bachelor of Science"
                          />
                        </InputGroup>
                      )}
                    </form.Field>
                    <form.Field name={`education[${index}].field` as const}>
                      {(field) => (
                        <InputGroup>
                          <InputGroupAddon>
                            <GraduationCap />
                          </InputGroupAddon>
                          <InputGroupInput
                            aria-label="Field of study"
                            value={field.state.value ?? ""}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value || undefined)
                            }
                            placeholder="Field of study (optional)"
                          />
                        </InputGroup>
                      )}
                    </form.Field>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => educationField.removeValue(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <form.Field name={`education[${index}].institution` as const}>
                    {(field) => (
                      <InputGroup>
                        <InputGroupAddon>
                          <Building2 />
                        </InputGroupAddon>
                        <InputGroupInput
                          aria-label="Institution"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="University or school"
                        />
                      </InputGroup>
                    )}
                  </form.Field>
                  <form.Field name={`education[${index}].endDate` as const}>
                    {(field) => (
                      <InputGroup>
                        <InputGroupAddon>
                          <Calendar />
                        </InputGroupAddon>
                        <InputGroupInput
                          aria-label="Graduation year"
                          value={field.state.value ?? ""}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value || undefined)}
                          placeholder="Graduation year, e.g. 2022"
                        />
                      </InputGroup>
                    )}
                  </form.Field>
                </div>
              </div>
            ))}

            {educationField.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No education entries yet. Add degrees or certifications recruiters screen for.
              </p>
            ) : null}
          </>
        )}
      </form.Field>
    </CollapsibleSection>
  );
}
