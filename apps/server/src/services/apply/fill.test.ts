import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, mock } from "bun:test";

import { fillApplication } from "./fill";
import type { ApplyForm, ApplyFormField } from "./types";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const seekForm = JSON.parse(
  readFileSync(path.join(fixtureDir, "__fixtures__/seek-quick-apply.json"), "utf8"),
) as ApplyForm;

describe("fillApplication", () => {
  it("fills stored answers, drafts the rest, then pauses without submitting", async () => {
    const answers = new Map<string, string>([
      ["right_to_work_au", "I'm an Australian citizen"],
      ["years_experience", "8"],
      ["salary_expectation", "150000 AUD annual"],
    ]);
    const applyField = mock(async () => {});
    const draftAnswer = mock(async (field: ApplyFormField) => `drafted: ${field.id}`);
    const recordDraft = mock(async () => {});
    const pause = mock(async () => {});

    const outcome = await fillApplication({
      extractForm: async () => seekForm,
      answers,
      draftAnswer,
      applyField,
      recordDraft,
      pause,
    });

    expect(outcome.status).toBe("awaiting_submit");

    // Every field on the form ends up filled: 3 stored + 1 drafted.
    expect(applyField).toHaveBeenCalledTimes(4);
    expect(outcome.filled).toHaveLength(4);

    const drafted = outcome.filled.filter((f) => f.source === "drafted");
    expect(drafted.map((f) => f.field.id)).toEqual(["coverNote"]);
    expect(drafted[0]?.value).toBe("drafted: coverNote");

    // The drafted answer is persisted for reuse.
    expect(recordDraft).toHaveBeenCalledTimes(1);

    // Control is handed to the human exactly once; nothing here can submit.
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("pauses even when no answers are stored (all fields drafted)", async () => {
    const draftAnswer = mock(async () => "draft");
    const applyField = mock(async () => {});
    const pause = mock(async () => {});

    const outcome = await fillApplication({
      extractForm: async () => seekForm,
      answers: new Map(),
      draftAnswer,
      applyField,
      pause,
    });

    expect(draftAnswer).toHaveBeenCalledTimes(seekForm.fields.length);
    expect(outcome.filled.every((f) => f.source === "drafted")).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
