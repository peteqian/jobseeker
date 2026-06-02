import { describe, expect, it, mock } from "bun:test";

let canned: string | null = null;
mock.module("../llm/oneShotPrompt", () => ({
  runOneShotPrompt: async () => canned,
  parseJsonResponse: (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
}));
mock.module("../skills/loadSkill", () => ({
  loadSkill: () => "review skill",
}));

const { reviewTailoredDoc } = await import("./recruiterReview");

const ARGS = {
  docMarkdown: "# Resume",
  jobBlock: "<job>x</job>",
  reviewSkill: "recruiter-review" as const,
};

describe("reviewTailoredDoc", () => {
  it("parses score and normalizes issues", async () => {
    canned = JSON.stringify({
      score: 88,
      issues: [
        { severity: "high", issue: "No metrics", fix: "Add numbers" },
        { severity: "bogus", issue: "Weak summary" },
        { issue: "" },
        "garbage",
      ],
    });
    const result = await reviewTailoredDoc(ARGS);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(88);
    // Empty-issue and non-object entries dropped; bad severity coerced to medium.
    expect(result!.issues).toEqual([
      { severity: "high", issue: "No metrics", fix: "Add numbers" },
      { severity: "medium", issue: "Weak summary", fix: "" },
    ]);
  });

  it("clamps score to 0-100", async () => {
    canned = JSON.stringify({ score: 250, issues: [] });
    expect((await reviewTailoredDoc(ARGS))!.score).toBe(100);
  });

  it("returns null when no provider or score missing", async () => {
    canned = null;
    expect(await reviewTailoredDoc(ARGS)).toBeNull();
    canned = JSON.stringify({ issues: [] });
    expect(await reviewTailoredDoc(ARGS)).toBeNull();
    canned = "not json";
    expect(await reviewTailoredDoc(ARGS)).toBeNull();
  });
});
