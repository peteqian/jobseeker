import { describe, expect, it } from "bun:test";
import type { ExplorerSearchConfig } from "@jobseeker/contracts";

import { getEnabledDomains, getSearchQueries } from "./queryPlanning";

const search = (roles: string[]): ExplorerSearchConfig => ({
  roles,
  freshness: "week",
  jobLimit: 25,
});

describe("getSearchQueries", () => {
  it("emits one query per role, deduped and trimmed", () => {
    const out = getSearchQueries(
      search(["Frontend Engineer", " frontend engineer ", "React Developer"]),
    );
    expect(out.map((q) => q.query)).toEqual(["Frontend Engineer", "React Developer"]);
    expect(out.every((q) => q.source === "search_role")).toBe(true);
  });

  it("drops low-signal roles (bare location / arrangement)", () => {
    const out = getSearchQueries(search(["remote", "NSW", "Backend Engineer"]));
    expect(out.map((q) => q.query)).toEqual(["Backend Engineer"]);
  });

  it("caps at the per-domain maximum", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Role ${i}`);
    expect(getSearchQueries(search(many)).length).toBe(8);
  });
});

describe("getEnabledDomains", () => {
  it("keeps only enabled domains", () => {
    const out = getEnabledDomains([
      { domain: "a.com", enabled: true },
      { domain: "b.com", enabled: false },
    ]);
    expect(out.map((d) => d.domain)).toEqual(["a.com"]);
  });
});
