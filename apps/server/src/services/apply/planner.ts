import { classifyField } from "./classify";
import type { ApplyForm, ApplyFormField, FillPlan } from "./types";

/**
 * Plans how to fill an application form from stored answers.
 *
 * For each field we classify its label to a semantic key and look up a stored
 * answer. A field becomes a `fill` only when an answer exists AND is valid for
 * the control (for select/radio the answer must be one of the options).
 * Everything else falls through to `unanswered`, which the apply flow drafts.
 *
 * @param answers semantic key -> stored answer text
 */
export function planFormFill(form: ApplyForm, answers: Map<string, string>): FillPlan {
  const fills: FillPlan["fills"] = [];
  const unanswered: ApplyFormField[] = [];

  for (const field of form.fields) {
    const key = classifyField(field.label);
    const value = key ? answers.get(key) : undefined;
    if (value !== undefined && isValidForControl(field, value)) {
      fills.push({ field, value, source: "stored" });
    } else {
      unanswered.push(field);
    }
  }

  return { fills, unanswered };
}

/** A stored value must be one of the listed options for choice controls. */
function isValidForControl(field: ApplyFormField, value: string): boolean {
  if (field.control === "select" || field.control === "radio") {
    return field.options?.includes(value) ?? false;
  }
  return value.trim().length > 0;
}
