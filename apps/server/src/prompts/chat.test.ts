import { describe, expect, it } from "bun:test";
import type { CoachClaim } from "@jobseeker/contracts";

import { buildSystemPrompt, parsePointDetails, stripTopicMarkers } from "./chat";

function claim(over: Partial<CoachClaim>): CoachClaim {
  return {
    id: "claim-1",
    reviewId: "review-1",
    text: "Led migration to microservices",
    status: "weak",
    statusReason: "no metrics",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("parsePointDetails", () => {
  it("parses a valid point-detail marker", () => {
    const text = `Thanks.
<!-- point-detail: {"claimId":"claim-1","originalText":"Led migration","expandedDetail":"Owned the cutover of 12 services over 3 months","evidence":["12 services","0 downtime"],"resumeAngle":"Led zero-downtime migration of 12 services"} -->`;
    const parsed = parsePointDetails(text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].claimId).toBe("claim-1");
    expect(parsed[0].evidence).toEqual(["12 services", "0 downtime"]);
    expect(parsed[0].resumeAngle).toContain("zero-downtime");
  });

  it("ignores malformed JSON without throwing", () => {
    const text = `<!-- point-detail: {not json} -->`;
    expect(parsePointDetails(text)).toHaveLength(0);
  });

  it("skips markers missing expandedDetail", () => {
    const text = `<!-- point-detail: {"claimId":"c1","originalText":"x"} -->`;
    expect(parsePointDetails(text)).toHaveLength(0);
  });

  it("parses multiple markers", () => {
    const text = `<!-- point-detail: {"expandedDetail":"a","evidence":[]} -->
<!-- point-detail: {"expandedDetail":"b","evidence":[]} -->`;
    expect(parsePointDetails(text)).toHaveLength(2);
  });
});

describe("stripTopicMarkers", () => {
  it("removes point-detail markers from the visible response", () => {
    const text = `Here is my reply.
<!-- point-detail: {"expandedDetail":"a","evidence":[]} -->`;
    expect(stripTopicMarkers(text)).toBe("Here is my reply.");
  });
});

describe("buildSystemPrompt agenda", () => {
  it("includes claims in priority order with the current marker", () => {
    const prompt = buildSystemPrompt({
      resumeText: null,
      profile: null,
      topics: [],
      agenda: {
        claims: [
          claim({ id: "a", text: "First point", status: "weak" }),
          claim({ id: "b", text: "Second point", status: "strong" }),
        ],
        currentClaimId: "a",
      },
    });
    expect(prompt).toContain("Interview agenda");
    expect(prompt).toContain("First point");
    expect(prompt).toContain("Second point");
    expect(prompt).toContain("← current");
    expect(prompt).toContain("point-detail");
  });

  it("omits the agenda section when no claims are supplied", () => {
    const prompt = buildSystemPrompt({ resumeText: null, profile: null, topics: [] });
    expect(prompt).not.toContain("Interview agenda");
  });
});
