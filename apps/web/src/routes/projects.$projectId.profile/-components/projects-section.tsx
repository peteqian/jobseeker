import { FolderGit2, Link, Plus, Tags, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";

import { CollapsibleSection } from "@/components/form/collapsible-section";
import { CommaSeparatedInput } from "@/components/form/comma-separated-input";
import { createEmptyProject, type ProfileForm } from "./types";

// One side / learning project: name, link, description, skills demonstrated.
export function ProjectsSection({ form }: { form: ProfileForm }) {
  return (
    <CollapsibleSection
      title="Projects"
      description="Side or learning projects that grew your skills — they don't need to be production-grade."
      contentClassName="space-y-4"
      defaultOpen={false}
      action={
        <form.Field name="projects" mode="array">
          {(projectsField) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => projectsField.pushValue(createEmptyProject())}
            >
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </form.Field>
      }
    >
      <form.Field name="projects" mode="array">
        {(projectsField) => (
          <>
            {projectsField.state.value.map((project, index) => (
              <div key={project.id} className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <form.Field name={`projects[${index}].name` as const}>
                      {(field) => (
                        <InputGroup>
                          <InputGroupAddon>
                            <FolderGit2 />
                          </InputGroupAddon>
                          <InputGroupInput
                            aria-label="Project name"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="Project name"
                          />
                        </InputGroup>
                      )}
                    </form.Field>
                    <form.Field name={`projects[${index}].url` as const}>
                      {(field) => (
                        <InputGroup>
                          <InputGroupAddon>
                            <Link />
                          </InputGroupAddon>
                          <InputGroupInput
                            aria-label="Project link"
                            type="url"
                            value={field.state.value ?? ""}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value || undefined)
                            }
                            placeholder="Link (optional)"
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
                    onClick={() => projectsField.removeValue(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>

                <form.Field name={`projects[${index}].description` as const}>
                  {(field) => (
                    <Textarea
                      aria-label="Project description"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="What it is and what you built"
                      rows={2}
                    />
                  )}
                </form.Field>

                <form.Field name={`projects[${index}].skillsUsed` as const}>
                  {(field) => (
                    <CommaSeparatedInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      placeholder="Skills used, comma separated"
                      icon={<Tags />}
                    />
                  )}
                </form.Field>
              </div>
            ))}

            {projectsField.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet. Add side or learning work that shows skills beyond your jobs.
              </p>
            ) : null}
          </>
        )}
      </form.Field>
    </CollapsibleSection>
  );
}
