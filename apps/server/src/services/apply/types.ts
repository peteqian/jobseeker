/**
 * Internal apply-phase types. These describe a job-application form once it has
 * been extracted from a page into a structured, browser-agnostic shape so the
 * fill planner and the apply flow can be unit-tested without a live browser.
 */

/** Where a stored application answer came from. */
export type AnswerSource = "profile" | "work_rights" | "user_edit" | "agent_draft";

/** Input control backing a single application form field. */
export type FieldControl = "text" | "textarea" | "select" | "radio" | "checkbox";

/** One field on an application form, extracted from the page. */
export interface ApplyFormField {
  /** Stable id for the field within the form (e.g. the DOM name/id). */
  id: string;
  /** Human label shown next to the field; what we classify and draft against. */
  label: string;
  control: FieldControl;
  /** Allowed values for select/radio/checkbox controls. */
  options?: string[];
  required?: boolean;
}

/** A job-application form extracted from a page. */
export interface ApplyForm {
  fields: ApplyFormField[];
}

/** A field paired with the value the planner resolved for it. */
export interface FieldFill {
  field: ApplyFormField;
  value: string;
  source: "stored" | "drafted";
}

/** Result of planning a fill from the answer store against a form. */
export interface FillPlan {
  /** Fields matched to a stored answer that is valid for the control. */
  fills: FieldFill[];
  /** Fields with no usable stored answer; these need a drafted answer. */
  unanswered: ApplyFormField[];
}

/** Terminal outcome of the apply flow. It never submits — a human does. */
export interface ApplyOutcome {
  status: "awaiting_submit";
  /** Every field the flow filled, stored answers and drafts alike. */
  filled: FieldFill[];
}
