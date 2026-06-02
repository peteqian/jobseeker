import { z } from "zod";
import {
  createDefaultActionRegistry,
  type ActionDefinition,
  type ActionRegistry,
  type ActionResult,
  type AgentControl,
} from "@peteqian/browser-agent-sdk";

import { questionKeyFor } from "./classify";

/**
 * Same zod cross-install bridge the explorer uses: the SDK is built against its
 * own `zod/v4` while the app is on standalone zod 4.4.3 (same engine, nominally
 * distinct types). See `explorer/actions.ts` for the full rationale.
 */
type SdkSchema<T> = ActionDefinition<string, T>["schema"];
const asSdkSchema = <T>(schema: z.ZodType<T>): SdkSchema<T> => schema as unknown as SdkSchema<T>;

const LOOKUP_SCHEMA = z.object({
  label: z.string().min(1),
});

const RECORD_SCHEMA = z.object({
  label: z.string().min(1),
  answer: z.string().min(1),
});

const SUBMIT_SCHEMA = z.object({
  summary: z.string().min(1),
});

/** Side-effect hooks the apply agent's custom actions need. */
export interface ApplyActionDeps {
  signal: AbortSignal;
  /** Stored answers for this project, semantic/slug key -> answer text. */
  answers: Map<string, string>;
  /** Persists a drafted answer (source agent_draft) for reuse on later applies. */
  recordDraft: (questionKey: string, answer: string) => Promise<void>;
  /** Surfaces the agent's review summary to the caller before pausing. */
  onReviewRequested: (summary: string) => void | Promise<void>;
  /** Stops the agent loop so a human can review and submit in the browser. */
  controller: AgentControl;
}

/**
 * Builds the apply action registry: SDK defaults (navigate/click/fill/select/…)
 * plus three apply-only actions.
 *
 * - `lookup_answer`: returns the stored answer for a form question so the agent
 *   fills it with the user's real data instead of guessing.
 * - `record_answer`: persists an answer the agent had to draft, keyed so the
 *   same question is answered instantly next time.
 * - `request_human_submit`: the only terminal step. Submitting is irreversible
 *   and stays human-gated, so the agent stops here — it never submits. The
 *   browser is left open for the person to review and click submit.
 */
export function buildApplyActions(deps: ApplyActionDeps): ActionRegistry {
  const registry = createDefaultActionRegistry();
  for (const definition of applyActionDefinitions(deps)) {
    registry.register(definition);
  }
  return registry;
}

/**
 * The apply-only action definitions, separate from the registry so they can be
 * unit-tested directly without a live browser.
 */
export function applyActionDefinitions(deps: ApplyActionDeps): ActionDefinition[] {
  const lookupAnswer: ActionDefinition<"lookup_answer", z.infer<typeof LOOKUP_SCHEMA>> = {
    name: "lookup_answer",
    description:
      "Before filling any application question, call this with the question's visible label to get the candidate's stored answer. If it returns one, fill the field with it verbatim. If none is stored, draft an answer yourself and then call record_answer.",
    schema: asSdkSchema(LOOKUP_SCHEMA),
    run: async (params): Promise<ActionResult> => {
      if (deps.signal.aborted) return { ok: false, message: "aborted" };
      const key = questionKeyFor(params.label);
      const answer = deps.answers.get(key);
      return answer !== undefined
        ? { ok: true, message: `Stored answer: ${answer}` }
        : { ok: false, message: "No stored answer. Draft one, then call record_answer." };
    },
  };

  const recordAnswer: ActionDefinition<"record_answer", z.infer<typeof RECORD_SCHEMA>> = {
    name: "record_answer",
    description:
      "After drafting an answer to a question that had no stored answer, call this with the question label and the answer you used so it is reused on future applications.",
    schema: asSdkSchema(RECORD_SCHEMA),
    run: async (params): Promise<ActionResult> => {
      if (deps.signal.aborted) return { ok: false, message: "aborted" };
      const key = questionKeyFor(params.label);
      deps.answers.set(key, params.answer);
      await deps.recordDraft(key, params.answer);
      return { ok: true, message: `Recorded answer for "${params.label}".` };
    },
  };

  const requestHumanSubmit: ActionDefinition<
    "request_human_submit",
    z.infer<typeof SUBMIT_SCHEMA>
  > = {
    name: "request_human_submit",
    description:
      "Call this once the application form is fully filled and ready. Provide a short summary of what you filled. This hands control to the human to review and submit. Do NOT click any submit/send button yourself.",
    schema: asSdkSchema(SUBMIT_SCHEMA),
    run: async (params): Promise<ActionResult> => {
      await deps.onReviewRequested(params.summary);
      deps.controller.stop("awaiting_human_submit");
      return { ok: true, message: "Paused for human review and submit." };
    },
  };

  return [lookupAnswer, recordAnswer, requestHumanSubmit] as ActionDefinition[];
}
