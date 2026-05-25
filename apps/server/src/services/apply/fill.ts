import { planFormFill } from "./planner";
import type { ApplyForm, ApplyFormField, ApplyOutcome, FieldFill } from "./types";

/**
 * Side-effect hooks the apply flow needs. Injecting them keeps the flow itself
 * pure and lets it run against a captured fixture in tests with no live
 * browser. The live wiring supplies DOM extraction, page fills, an LLM drafter,
 * and the SDK controller's pause.
 *
 * There is deliberately no `submit` hook: submitting an application is
 * irreversible and stays human-gated, so this flow cannot submit by
 * construction.
 */
export interface FillDeps {
  /** Pulls the structured form off the current page. */
  extractForm: () => Promise<ApplyForm>;
  /** Stored answers for the project, semantic key -> answer text. */
  answers: Map<string, string>;
  /** Drafts an answer for a field with no stored answer. */
  draftAnswer: (field: ApplyFormField) => Promise<string>;
  /** Writes a resolved value into the field on the page. */
  applyField: (field: ApplyFormField, value: string) => Promise<void>;
  /** Persists a drafted answer back to the store for reuse. */
  recordDraft?: (field: ApplyFormField, value: string) => Promise<void>;
  /** Hands control to the human for review and submit. */
  pause: () => Promise<void>;
}

/**
 * Fills an application form from stored answers, drafts the rest, then pauses
 * for human review. Returns once paused; it never submits.
 */
export async function fillApplication(deps: FillDeps): Promise<ApplyOutcome> {
  const form = await deps.extractForm();
  const { fills, unanswered } = planFormFill(form, deps.answers);

  const filled: FieldFill[] = [];

  for (const fill of fills) {
    await deps.applyField(fill.field, fill.value);
    filled.push(fill);
  }

  for (const field of unanswered) {
    const value = await deps.draftAnswer(field);
    await deps.applyField(field, value);
    await deps.recordDraft?.(field, value);
    filled.push({ field, value, source: "drafted" });
  }

  await deps.pause();

  return { status: "awaiting_submit", filled };
}
