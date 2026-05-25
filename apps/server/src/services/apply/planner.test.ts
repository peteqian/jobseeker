import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";

import { planFormFill } from "./planner";
import type { ApplyForm } from "./types";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const seekForm = JSON.parse(
  readFileSync(path.join(fixtureDir, "__fixtures__/seek-quick-apply.json"), "utf8"),
) as ApplyForm;

describe("planFormFill", () => {
  it("fills classified fields from stored answers and leaves the rest unanswered", () => {
    const answers = new Map<string, string>([
      ["right_to_work_au", "I'm an Australian citizen"],
      ["years_experience", "8"],
      ["salary_expectation", "150000 AUD annual"],
    ]);

    const { fills, unanswered } = planFormFill(seekForm, answers);

    expect(fills.map((f) => f.field.id).sort()).toEqual([
      "expectedSalary",
      "rightToWork",
      "yearsExperience",
    ]);
    expect(fills.every((f) => f.source === "stored")).toBe(true);
    // The free-text "why do you want to work for us?" has no stored answer.
    expect(unanswered.map((f) => f.id)).toEqual(["coverNote"]);
  });

  it("rejects a stored select value that is not one of the options", () => {
    const answers = new Map<string, string>([["right_to_work_au", "Not a real option"]]);

    const { fills, unanswered } = planFormFill(seekForm, answers);

    expect(fills.some((f) => f.field.id === "rightToWork")).toBe(false);
    expect(unanswered.map((f) => f.id)).toContain("rightToWork");
  });
});
