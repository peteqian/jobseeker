import { describe, expect, it } from "bun:test";

import { classifyField, questionKeyFor } from "./classify";

describe("classifyField", () => {
  it("maps SEEK work-rights phrasings to right_to_work_au", () => {
    expect(classifyField("What is your right to work in Australia?")).toBe("right_to_work_au");
    expect(classifyField("Are you eligible to work in Australia?")).toBe("right_to_work_au");
    expect(classifyField("Work rights")).toBe("right_to_work_au");
  });

  it("converges motivation question phrasings to one key", () => {
    const key = "motivation";
    expect(classifyField("Why do you want this role?")).toBe(key);
    expect(classifyField("Why are you applying for this job?")).toBe(key);
    expect(classifyField("Why this position?")).toBe(key);
    expect(classifyField("Why do you want to work at this company?")).toBe(key);
  });

  it("maps notice period and availability questions", () => {
    expect(classifyField("What is your notice period?")).toBe("notice_period");
    expect(classifyField("When are you available to start?")).toBe("availability");
    expect(classifyField("Preferred start date")).toBe("availability");
  });

  it("keeps years-experience and salary classification", () => {
    expect(classifyField("How many years of experience do you have?")).toBe("years_experience");
    expect(classifyField("Expected salary?")).toBe("salary_expectation");
  });

  it("falls back to a slug for unclassified labels", () => {
    expect(questionKeyFor("Describe a hard project you led")).toBe(
      "describe_a_hard_project_you_led",
    );
  });
});
