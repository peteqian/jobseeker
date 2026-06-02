import { Ban, Building2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import type { StructuredProfile } from "@jobseeker/contracts";

import { AiTag } from "@/components/form/ai-tag";
import { CollapsibleSection } from "@/components/form/collapsible-section";
import { CommaSeparatedInput } from "@/components/form/comma-separated-input";
import { selectClassName, type ProfileForm } from "./types";

export function CompanyPreferencesSection({ form }: { form: ProfileForm }) {
  return (
    <CollapsibleSection
      title="Company preferences"
      description="Inferred from your background. Adjust to narrow your job search."
      badge={<AiTag />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="targeting.companyPreference.size">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Company size</Label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value
                      ? (event.target
                          .value as StructuredProfile["targeting"]["companyPreference"]["size"])
                      : undefined,
                  )
                }
                className={selectClassName}
              >
                <option value="">Any</option>
                <option value="startup">Startup</option>
                <option value="small">Small</option>
                <option value="mid">Mid-size</option>
                <option value="large">Large</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          )}
        </form.Field>

        <form.Field name="targeting.companyPreference.stage">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Stage</Label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value
                      ? (event.target
                          .value as StructuredProfile["targeting"]["companyPreference"]["stage"])
                      : undefined,
                  )
                }
                className={selectClassName}
              >
                <option value="">Any</option>
                <option value="seed">Seed</option>
                <option value="early">Early</option>
                <option value="growth">Growth</option>
                <option value="established">Established</option>
              </select>
            </div>
          )}
        </form.Field>

        <form.Field name="targeting.companyPreference.industries">
          {(field) => (
            <div className="sm:col-span-2">
              <CommaSeparatedInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                placeholder="Industries — FinTech, SaaS, HealthTech"
                icon={<Building2 />}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="targeting.companyPreference.avoidIndustries">
          {(field) => (
            <div className="sm:col-span-2">
              <CommaSeparatedInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                placeholder="Industries to avoid — Gambling, Oil & Gas"
                icon={<Ban />}
              />
            </div>
          )}
        </form.Field>
      </div>
    </CollapsibleSection>
  );
}
