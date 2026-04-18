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
