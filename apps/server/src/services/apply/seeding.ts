import type { StructuredProfile, WorkRightStatus } from "@jobseeker/contracts";

import type { SemanticKey } from "./classify";
import type { AnswerSource } from "./types";

/** A profile-derived answer ready to be written to the store. */
export interface DerivedAnswer {
  key: SemanticKey;
  answer: string;
  source: AnswerSource;
}

/** SEEK-style answer text for each "right to work in Australia" category. */
const WORK_RIGHT_ANSWERS: Record<WorkRightStatus, string | null> = {
  unspecified: null,
  citizen: "I'm an Australian citizen",
  permanent_resident: "I'm a permanent resident",
  work_visa: "I have a temporary work visa",
  student_visa: "I have a student visa",
  needs_sponsorship: "I require visa sponsorship",
};

/**
 * Derives the application answers a profile can supply, keyed by semantic key.
 * Only fields the profile actually states are returned; unset fields are
 * omitted so they fall through to drafting at apply time.
 *
 * Pure (no db) so it is unit-testable on its own.
 */
export function deriveAnswersFromProfile(profile: StructuredProfile): DerivedAnswer[] {
  const derived: DerivedAnswer[] = [];

  const rights = profile.workRights;
  if (rights) {
    // SEEK is Australia-only, so the screening answer comes from the AU entry.
    const au = rights.rights.find((entry) => entry.country === "AU");
    if (au) {
      const workRight = WORK_RIGHT_ANSWERS[au.status];
      if (workRight)
        derived.push({ key: "right_to_work_au", answer: workRight, source: "work_rights" });
      if (au.visaDetail) {
        derived.push({ key: "visa_detail", answer: au.visaDetail, source: "work_rights" });
      }
    }
    if (rights.citizenship.length > 0) {
      derived.push({
        key: "citizenship",
        answer: rights.citizenship.join(", "),
        source: "work_rights",
      });
    }
  }

  if (profile.identity.name) {
    derived.push({ key: "full_name", answer: profile.identity.name, source: "profile" });
  }
  if (typeof profile.identity.yearsOfExperience === "number") {
    derived.push({
      key: "years_experience",
      answer: String(profile.identity.yearsOfExperience),
      source: "profile",
    });
  }
  const salary = formatSalary(profile.targeting.salaryExpectation);
  if (salary) derived.push({ key: "salary_expectation", answer: salary, source: "profile" });

  return derived;
}

function formatSalary(salary: StructuredProfile["targeting"]["salaryExpectation"]): string | null {
  if (!salary) return null;
  const amount = salary.max ?? salary.min;
  if (typeof amount !== "number") return null;
  return `${amount} ${salary.currency} ${salary.period}`;
}
