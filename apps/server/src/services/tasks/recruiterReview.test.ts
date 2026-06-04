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
  it("parses the two-judgment verdict and normalizes issues", async () => {
    canned = JSON.stringify({
      presentationScore: 88,
      fitScore: 64,
      shortlist: "maybe",
      gaps: ["Job's backend stack absent from background", 42, ""],
      issues: [
        { severity: "high", issue: "No metrics", fix: "Add numbers" },
        { severity: "bogus", issue: "Weak summary" },
        { issue: "" },
        "garbage",
      ],
    });
    const result = await reviewTailoredDoc(ARGS);
    expect(result).not.toBeNull();
    expect(result!.presentationScore).toBe(88);
    expect(result!.fitScore).toBe(64);
    expect(result!.shortlist).toBe("maybe");
    // Non-string and empty gaps dropped.
    expect(result!.gaps).toEqual(["Job's backend stack absent from background"]);
    // Empty-issue and non-object entries dropped; bad severity coerced to medium.
    expect(result!.issues).toEqual([
      { severity: "high", issue: "No metrics", fix: "Add numbers" },
      { severity: "medium", issue: "Weak summary", fix: "" },
    ]);
  });

  it("falls back to the legacy single score for both judgments", async () => {
    canned = JSON.stringify({ score: 78, issues: [] });
    const result = await reviewTailoredDoc(ARGS);
    expect(result!.presentationScore).toBe(78);
    expect(result!.fitScore).toBe(78);
    // Shortlist inferred from fit when the skill omits it.
    expect(result!.shortlist).toBe("yes");
    expect(result!.gaps).toEqual([]);
  });

  it("clamps scores to 0-100", async () => {
    canned = JSON.stringify({ presentationScore: 250, fitScore: -5, issues: [] });
    const result = await reviewTailoredDoc(ARGS);
    expect(result!.presentationScore).toBe(100);
    expect(result!.fitScore).toBe(0);
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
