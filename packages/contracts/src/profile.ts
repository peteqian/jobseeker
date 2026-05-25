export interface ProfileExperience {
  id: string;
  company: string;
  title: string;
  duration: string;
  achievements: string[];
  skillsUsed: string[];
  isCurrent?: boolean;
}

export interface ProfileSkill {
  name: string;
  category: "technical" | "domain" | "soft" | "tool";
  level?: "beginner" | "intermediate" | "advanced" | "expert";
  yearsOfExperience?: number;
  evidence?: string[];
}

export interface ProfileTargetRole {
  title: string;
  level: "entry" | "mid" | "senior" | "lead" | "principal";
  priority: number;
  reasons: string[];
}

export interface ProfileLocation {
  city: string;
  state?: string;
  country?: string;
  remote: "no" | "hybrid" | "full";
  priority: number;
}

export interface ProfileCompanyPreference {
  size?: "startup" | "small" | "mid" | "large" | "enterprise";
  stage?: "seed" | "early" | "growth" | "established";
  industries: string[];
  avoidIndustries: string[];
  values?: string[];
}

export interface ProfileSearchContext {
  effectiveKeywords: string[];
  ineffectiveKeywords: string[];
  discoveredPatterns: {
    pattern: string;
    outcome: "success" | "failure";
    discoveredAt: string;
  }[];
}

export interface ProfileMemory {
  clarifications: {
    questionId: string;
    question: string;
    answer: string;
    answeredAt: string;
  }[];
  discoveredPreferences: {
    preference: string;
    source: "resume" | "question" | "discovery";
    discoveredAt: string;
  }[];
}

/** SEEK-style "right to work in Australia" category. */
export type AustraliaWorkRight =
  | "unspecified"
  | "citizen"
  | "permanent_resident"
  | "nz_citizen"
  | "work_visa"
  | "student_visa"
  | "needs_sponsorship";

export interface ProfileWorkRights {
  /** Citizenship by ISO 3166-1 alpha-2 country code (e.g. "AU", "GB"). */
  citizenship: string[];
  australiaWorkRights: AustraliaWorkRight;
  /** Visa subclass / detail, when on a temporary visa (e.g. "Subclass 482"). */
  visaDetail?: string;
}

export interface StructuredProfile {
  version: number;
  updatedAt: string;
  identity: {
    name?: string;
    headline?: string;
    summary: string;
    yearsOfExperience?: number;
  };
  experiences: ProfileExperience[];
  skills: ProfileSkill[];
  targeting: {
    roles: ProfileTargetRole[];
    locations: ProfileLocation[];
    companyPreference: ProfileCompanyPreference;
    salaryExpectation?: {
      min?: number;
      max?: number;
      currency: "AUD" | "USD" | "EUR" | "GBP";
      period: "hourly" | "daily" | "annual";
    };
  };
  searchContext: ProfileSearchContext;
  memory: ProfileMemory;
  /** Work eligibility, used to answer application screening questions. */
  workRights?: ProfileWorkRights;
}

export interface UpdateProfileInput {
  projectId: string;
  profile: StructuredProfile;
}

export interface ProfileGenerationResult {
  profile: StructuredProfile;
  questions: Array<{
    prompt: string;
    fields: import("./questions").PendingQuestionField[];
  }>;
}
