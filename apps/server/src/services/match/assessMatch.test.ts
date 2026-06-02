import { describe, expect, it, mock } from "bun:test";
import type { StructuredProfile } from "@jobseeker/contracts";

// Canned LLM output per test. The judge's HR-inflation reasoning lives in the
// prompt (not unit-testable without a live model); these tests pin the parsing,
// normalization, and clamping the code is responsible for.
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

const { assessMatch } = await import("./assessMatch");

const PROFILE: StructuredProfile = {
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  identity: { name: "Jr Dev", summary: "Junior engineer", yearsOfExperience: 1 },
  experiences: [],
  skills: [{ name: "React", category: "technical", level: "intermediate" } as never],
  targeting: {
    roles: [{ title: "Frontend Engineer", level: "junior" } as never],
    locations: [],
    companyPreference: { industries: [], avoidIndustries: [] } as never,
  } as never,
  searchContext: { effectiveKeywords: [] } as never,
  memory: { discoveredPreferences: [] } as never,
};

const JOB = { title: "Frontend Engineer", company: "Acme", location: "Sydney" };

describe("assessMatch", () => {
  it("returns the parsed level, clamped score, and trimmed reasons/gaps", async () => {
    canned = JSON.stringify({
      level: "partial",
      score: 142,
      reasons: ["r1", "r2", "r3", "r4", "r5", "r6"],
      gaps: ["g1"],
    });
    const result = await assessMatch({
      job: JOB,
      descriptionText: "5+ years React",
      profile: PROFILE,
    });
    expect(result).not.toBeNull();
    expect(result!.level).toBe("partial");
    expect(result!.score).toBe(100); // clamped from 142
    expect(result!.reasons).toHaveLength(5); // capped at 5
    expect(result!.gaps).toEqual(["g1"]);
  });

  it("accepts exact / no_match levels", async () => {
    canned = JSON.stringify({ level: "exact", score: 90, reasons: [], gaps: [] });
    expect((await assessMatch({ job: JOB, descriptionText: "x", profile: PROFILE }))!.level).toBe(
      "exact",
    );
    canned = JSON.stringify({ level: "no_match", score: 5, reasons: [], gaps: [] });
    expect((await assessMatch({ job: JOB, descriptionText: "x", profile: PROFILE }))!.level).toBe(
      "no_match",
    );
  });

  it("returns null when no provider is available", async () => {
    canned = null;
    expect(await assessMatch({ job: JOB, descriptionText: "x", profile: PROFILE })).toBeNull();
  });

  it("returns null on an unparseable response", async () => {
    canned = "not json";
    expect(await assessMatch({ job: JOB, descriptionText: "x", profile: PROFILE })).toBeNull();
  });

  it("returns null when the level is missing or invalid", async () => {
    canned = JSON.stringify({ score: 80, reasons: [], gaps: [] });
    expect(await assessMatch({ job: JOB, descriptionText: "x", profile: PROFILE })).toBeNull();
    canned = JSON.stringify({ level: "maybe", score: 80 });
    expect(await assessMatch({ job: JOB, descriptionText: "x", profile: PROFILE })).toBeNull();
  });
});
