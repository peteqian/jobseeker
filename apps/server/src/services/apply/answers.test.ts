import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { StructuredProfile } from "@jobseeker/contracts";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { db } from "../../db";
import { projects } from "../../db/schema";
import {
  answersMap,
  clearAnswers,
  readAnswers,
  seedAnswersFromProfile,
  upsertAnswer,
} from "./answers";
import { deriveAnswersFromProfile } from "./seeding";

function makeProfile(overrides: Partial<StructuredProfile> = {}): StructuredProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    identity: { name: "Ada Lovelace", summary: "", yearsOfExperience: 8 },
    experiences: [],
    skills: [],
    targeting: {
      roles: [],
      locations: [],
      companyPreference: { industries: [], avoidIndustries: [] },
      salaryExpectation: { max: 150000, currency: "AUD", period: "annual" },
    },
    searchContext: { effectiveKeywords: [], ineffectiveKeywords: [], discoveredPatterns: [] },
    memory: { clarifications: [], discoveredPreferences: [] },
    workRights: { citizenship: ["AU"], rights: [{ country: "AU", status: "citizen" }] },
    ...overrides,
  };
}

describe("deriveAnswersFromProfile (pure)", () => {
  it("derives answers keyed by semantic key with the right source", () => {
    const byKey = new Map(deriveAnswersFromProfile(makeProfile()).map((d) => [d.key, d]));

    expect(byKey.get("right_to_work_au")).toMatchObject({
      answer: "I'm an Australian citizen",
      source: "work_rights",
    });
    expect(byKey.get("citizenship")).toMatchObject({ answer: "AU", source: "work_rights" });
    expect(byKey.get("full_name")).toMatchObject({ answer: "Ada Lovelace", source: "profile" });
    expect(byKey.get("years_experience")).toMatchObject({ answer: "8", source: "profile" });
    expect(byKey.get("salary_expectation")).toMatchObject({
      answer: "150000 AUD annual",
      source: "profile",
    });
  });

  it("omits fields the profile does not state", () => {
    const sparse = makeProfile({
      identity: { name: undefined, summary: "" },
      targeting: {
        roles: [],
        locations: [],
        companyPreference: { industries: [], avoidIndustries: [] },
      },
      workRights: { citizenship: [], rights: [] },
    });

    expect(deriveAnswersFromProfile(sparse)).toEqual([]);
  });

  it("derives the most recent qualification as highest_education", () => {
    const withEducation = makeProfile({
      education: [
        { id: "1", institution: "TAFE", degree: "Diploma of IT", endDate: "2016" },
        {
          id: "2",
          institution: "UNSW",
          degree: "Bachelor of Science",
          field: "Computer Science",
          endDate: "2020",
        },
      ],
    });
    const byKey = new Map(deriveAnswersFromProfile(withEducation).map((d) => [d.key, d.answer]));

    expect(byKey.get("highest_education")).toBe("Bachelor of Science in Computer Science, UNSW");
  });

  it("includes visa detail only when present", () => {
    const withVisa = makeProfile({
      workRights: {
        citizenship: ["GB"],
        rights: [{ country: "AU", status: "work_visa", visaDetail: "Subclass 482" }],
      },
    });
    const byKey = new Map(deriveAnswersFromProfile(withVisa).map((d) => [d.key, d.answer]));

    expect(byKey.get("right_to_work_au")).toBe("I have a temporary work visa");
    expect(byKey.get("visa_detail")).toBe("Subclass 482");
  });
});

describe("application answers store (db)", () => {
  let projectId: string;

  beforeEach(async () => {
    projectId = randomUUID();
    const now = new Date().toISOString();
    await db
      .insert(projects)
      .values({ id: projectId, title: "Test", status: "active", createdAt: now, updatedAt: now });
  });

  afterEach(async () => {
    await clearAnswers(projectId);
    await db.delete(projects).where(eq(projects.id, projectId));
  });

  it("seeds from a profile and reads back by semantic key", async () => {
    await seedAnswersFromProfile(projectId, makeProfile());

    const map = await answersMap(projectId);
    expect(map.get("right_to_work_au")).toBe("I'm an Australian citizen");
    expect(map.get("full_name")).toBe("Ada Lovelace");
    expect(map.get("years_experience")).toBe("8");
    expect(map.get("citizenship")).toBe("AU");
    expect(map.get("salary_expectation")).toBe("150000 AUD annual");

    const rows = await readAnswers(projectId);
    expect(rows.find((r) => r.questionKey === "right_to_work_au")?.source).toBe("work_rights");
  });

  it("never overwrites a manual user_edit when reseeding from the profile", async () => {
    await upsertAnswer({
      projectId,
      questionKey: "right_to_work_au",
      answer: "Hand-typed answer",
      source: "user_edit",
    });

    await seedAnswersFromProfile(projectId, makeProfile());

    const map = await answersMap(projectId);
    expect(map.get("right_to_work_au")).toBe("Hand-typed answer");
  });
});
