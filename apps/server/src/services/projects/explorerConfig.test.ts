import { describe, expect, it } from "bun:test";

import { mapExplorerConfigRow } from "./explorerConfig";

type Row = Parameters<typeof mapExplorerConfigRow>[0];

function row(over: Partial<Row>): Row {
  return {
    projectId: "p1",
    domainsJson: "[]",
    searchJson: null,
    includeAgentSuggestions: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as Row;
}

describe("mapExplorerConfigRow", () => {
  it("parses the new searchJson when present", () => {
    const r = row({
      domainsJson: JSON.stringify([{ domain: "seek.com.au", enabled: true }]),
      searchJson: JSON.stringify({
        roles: ["Senior Frontend Engineer"],
        locationText: "Sydney NSW",
        remotePreference: "hybrid",
        freshness: "24h",
        jobLimit: 40,
      }),
    });
    const mapped = mapExplorerConfigRow(r);
    expect(mapped.domains).toEqual([{ domain: "seek.com.au", enabled: true }]);
    expect(mapped.search).toEqual({
      roles: ["Senior Frontend Engineer"],
      locationText: "Sydney NSW",
      remotePreference: "hybrid",
      freshness: "24h",
      jobLimit: 40,
      runMode: "sequential",
    });
  });

  it("preserves an explicit parallel runMode", () => {
    const r = row({
      searchJson: JSON.stringify({
        roles: [],
        freshness: "week",
        jobLimit: 25,
        runMode: "parallel",
      }),
    });
    expect(mapExplorerConfigRow(r).search.runMode).toBe("parallel");
  });

  it("synthesizes a search set from a legacy per-domain row (no searchJson)", () => {
    const r = row({
      domainsJson: JSON.stringify([
        {
          domain: "seek.com.au",
          enabled: true,
          queries: ["Frontend Engineer"],
          jobLimit: 30,
          freshness: "month",
        },
        { domain: "indeed.com", enabled: false, queries: ["Frontend Engineer", "React Developer"] },
      ]),
    });
    const mapped = mapExplorerConfigRow(r);
    // domains slimmed to toggles
    expect(mapped.domains).toEqual([
      { domain: "seek.com.au", enabled: true },
      { domain: "indeed.com", enabled: false },
    ]);
    // roles deduped from all legacy queries; freshness/jobLimit from first object
    expect(mapped.search.roles).toEqual(["Frontend Engineer", "React Developer"]);
    expect(mapped.search.freshness).toBe("month");
    expect(mapped.search.jobLimit).toBe(30);
  });

  it("falls back to defaults for an empty legacy row", () => {
    const mapped = mapExplorerConfigRow(row({ domainsJson: "[]" }));
    expect(mapped.search).toEqual({
      roles: [],
      freshness: "week",
      jobLimit: 25,
      runMode: "sequential",
    });
  });
});
