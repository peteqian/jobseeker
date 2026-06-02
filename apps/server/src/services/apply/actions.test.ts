import type { ActionContext, ActionDefinition, AgentControl } from "@peteqian/browser-agent-sdk";
import { describe, expect, it, mock } from "bun:test";

import { applyActionDefinitions, type ApplyActionDeps } from "./actions";

const emptyContext = {} as unknown as ActionContext;

function fakeController(): AgentControl & { stop: ReturnType<typeof mock> } {
  return {
    signal: new AbortController().signal,
    isPaused: false,
    stopReason: undefined,
    pause: mock(() => {}),
    resume: mock(() => {}),
    stop: mock((_reason?: string) => {}),
    waitIfPaused: mock(async () => {}),
  };
}

function setup(overrides: Partial<ApplyActionDeps> = {}) {
  const controller = fakeController();
  const recordDraft = mock(async (_k: string, _a: string) => {});
  const onReviewRequested = mock((_s: string) => {});
  const deps: ApplyActionDeps = {
    signal: new AbortController().signal,
    answers: new Map(),
    recordDraft,
    onReviewRequested,
    controller,
    ...overrides,
  };
  const byName = new Map(applyActionDefinitions(deps).map((d) => [d.name, d]));
  return { deps, controller, recordDraft, onReviewRequested, byName };
}

function run(def: ActionDefinition, params: unknown) {
  return def.run(params, emptyContext);
}

describe("apply actions", () => {
  it("lookup_answer returns a stored answer when one is classified", async () => {
    const answers = new Map([["right_to_work_au", "I'm an Australian citizen"]]);
    const { byName } = setup({ answers });

    const hit = await run(byName.get("lookup_answer")!, {
      label: "What is your right to work in Australia?",
    });
    expect(hit.ok).toBe(true);
    expect(hit.message).toContain("I'm an Australian citizen");

    const miss = await run(byName.get("lookup_answer")!, { label: "Describe a hard project" });
    expect(miss.ok).toBe(false);
  });

  it("record_answer persists the draft and caches it in the live map", async () => {
    const { byName, recordDraft, deps } = setup();

    const result = await run(byName.get("record_answer")!, {
      label: "Why do you want this job?",
      answer: "Mission alignment.",
    });

    expect(result.ok).toBe(true);
    expect(recordDraft).toHaveBeenCalledTimes(1);
    // Same key is reused on the next lookup within the run. A motivation
    // question classifies to the shared "motivation" key, not a label slug, so
    // the draft is reused across differently-phrased "why this role" questions.
    expect(deps.answers.get("motivation")).toBe("Mission alignment.");
  });

  it("request_human_submit surfaces the summary and stops the loop, never submitting", async () => {
    const { byName, controller, onReviewRequested } = setup();

    const result = await run(byName.get("request_human_submit")!, { summary: "Filled 4 fields." });

    expect(result.ok).toBe(true);
    expect(onReviewRequested).toHaveBeenCalledTimes(1);
    expect(controller.stop).toHaveBeenCalledTimes(1);
    expect(controller.stop).toHaveBeenCalledWith("awaiting_human_submit");
  });
});
