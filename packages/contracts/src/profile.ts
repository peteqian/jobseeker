export interface ProfileExperience {
  id: string;
  company: string;
  title: string;
  /** Start month, ISO "YYYY-MM". */
  startDate?: string;
  /** End month, ISO "YYYY-MM". Omitted while the role is current. */
  endDate?: string;
  achievements: string[];
  skillsUsed: string[];
  isCurrent?: boolean;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "YYYY-MM" → "Mon YYYY"; passes other strings through unchanged. */
function formatMonth(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = MONTH_NAMES[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : match[1];
}

/** Absolute month index for a "YYYY-MM" string, or null if unparseable. */
function monthIndex(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

/**
 * Total years of professional experience derived from work-history date spans.
 * Overlapping roles are merged so concurrent jobs don't double-count; current
 * roles (no end date) run to `asOf`. Returns whole years (rounded). 0 when no
 * dated experience exists.
 */
export function computeYearsOfExperience(
  experiences: ProfileExperience[],
  asOf: Date = new Date(),
): number {
  const nowIndex = asOf.getFullYear() * 12 + asOf.getMonth();
  const intervals: Array<[number, number]> = [];
  for (const exp of experiences) {
    const start = monthIndex(exp.startDate);
    if (start === null) continue;
    const end = exp.isCurrent || !exp.endDate ? nowIndex : monthIndex(exp.endDate);
    if (end === null || end < start) continue;
    intervals.push([start, end]);
  }
  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [spanStart, spanEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i += 1) {
    const [start, end] = intervals[i];
    if (start <= spanEnd) {
      spanEnd = Math.max(spanEnd, end);
    } else {
      months += spanEnd - spanStart;
      spanStart = start;
      spanEnd = end;
    }
  }
  months += spanEnd - spanStart;
  return Math.round(months / 12);
}

/** Human-readable period for an experience, e.g. "Jan 2020 – Present". */
export function formatExperiencePeriod(exp: ProfileExperience): string {
  const start = formatMonth(exp.startDate);
  const end = exp.isCurrent ? "Present" : formatMonth(exp.endDate);
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? "";
}

const MONTH_INDEX: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** Parses a single "Jan 2024" / "2024" / "2024-01" token into "YYYY-MM". */
function parseMonthToken(token: string): string | undefined {
  const value = token.trim();
  if (!value) return undefined;
  const iso = /^(\d{4})-(\d{2})$/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = /^([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(value);
  if (named) {
    const month = MONTH_INDEX[named[1].slice(0, 3).toLowerCase()];
    if (month) return `${named[2]}-${month}`;
  }
  const yearOnly = /^(\d{4})$/.exec(value);
  if (yearOnly) return `${yearOnly[1]}-01`;
  return undefined;
}

/**
 * Coerces a stored experience into the current shape, folding the legacy
 * free-text `duration` (e.g. "Jan 2020 - Present") into startDate/endDate.
 */
export function normalizeExperience(raw: unknown): ProfileExperience {
  const e = (raw ?? {}) as Partial<ProfileExperience> & { duration?: string };
  const base: ProfileExperience = {
    id: e.id ?? "",
    company: e.company ?? "",
    title: e.title ?? "",
    achievements: Array.isArray(e.achievements) ? e.achievements : [],
    skillsUsed: Array.isArray(e.skillsUsed) ? e.skillsUsed : [],
    isCurrent: Boolean(e.isCurrent),
  };

  if (e.startDate !== undefined || e.endDate !== undefined) {
    return { ...base, startDate: e.startDate, endDate: base.isCurrent ? undefined : e.endDate };
  }

  if (typeof e.duration === "string" && e.duration.trim()) {
    const [startPart = "", endPart = ""] = e.duration.split(/[-–—]/).map((part) => part.trim());
    const isPresent = /present|current|now/i.test(endPart);
    return {
      ...base,
      startDate: parseMonthToken(startPart),
      endDate: isPresent ? undefined : parseMonthToken(endPart),
      isCurrent: base.isCurrent || isPresent,
    };
  }

  return base;
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

/**
 * Side / learning project that expands the candidate's skillset. Distinct from
 * paid work experience — not necessarily production-grade, but evidence of
 * skills the résumé may not otherwise show.
 */
export interface ProfileProject {
  id: string;
  name: string;
  description: string;
  skillsUsed: string[];
  /** Optional link to a repo, demo, or write-up. */
  url?: string;
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

/** Generic right-to-work category, applicable to any country. */
export type WorkRightStatus =
  | "unspecified"
  | "citizen"
  | "permanent_resident"
  | "work_visa"
  | "student_visa"
  | "needs_sponsorship";

/** Right to work in a single country. */
export interface ProfileWorkRightEntry {
  /** Country the right applies to, ISO 3166-1 alpha-2 (e.g. "AU", "GB"). */
  country: string;
  status: WorkRightStatus;
  /** Visa subclass / detail, when on a temporary visa (e.g. "Subclass 482"). */
  visaDetail?: string;
}

export interface ProfileWorkRights {
  /** Citizenship by ISO 3166-1 alpha-2 country code (e.g. "AU", "GB"). */
  citizenship: string[];
  /** Right to work, one entry per country. */
  rights: ProfileWorkRightEntry[];
}

/**
 * Coerces any stored workRights value into the current shape. Tolerates the
 * legacy AU-only shape (`{ australiaWorkRights, visaDetail }`) by folding it
 * into a single "AU" entry, so older persisted profiles keep working.
 */
export function normalizeWorkRights(raw: unknown): ProfileWorkRights {
  if (!raw || typeof raw !== "object") return { citizenship: [], rights: [] };
  const value = raw as {
    citizenship?: unknown;
    rights?: unknown;
    australiaWorkRights?: string;
    visaDetail?: string;
  };
  const citizenship = Array.isArray(value.citizenship)
    ? value.citizenship.filter((code): code is string => typeof code === "string")
    : [];

  if (Array.isArray(value.rights)) {
    return { citizenship, rights: value.rights as ProfileWorkRightEntry[] };
  }

  const legacy = value.australiaWorkRights;
  if (legacy && legacy !== "unspecified") {
    // "nz_citizen" has no generic equivalent; NZ citizens hold open-ended AU
    // work rights, so map it to permanent_resident (lossy, documented).
    const status: WorkRightStatus =
      legacy === "nz_citizen" ? "permanent_resident" : (legacy as WorkRightStatus);
    const entry: ProfileWorkRightEntry = { country: "AU", status };
    if (value.visaDetail) entry.visaDetail = value.visaDetail;
    return { citizenship, rights: [entry] };
  }

  return { citizenship, rights: [] };
}

/**
 * A resume point expanded through the coach interview. Links an original
 * resume line / coach claim to the richer story the candidate told about it.
 * User-authored ground truth — preserved verbatim across profile rebuilds.
 */
export interface ProfilePointDetail {
  id: string;
  /** The original resume line / claim this expands. */
  originalText: string;
  /** Stable link back to the coachClaim that seeded it, when available. */
  claimId?: string;
  /** The richer story extracted from the interview. */
  expandedDetail: string;
  /** Concrete evidence gathered (metrics, scope, outcomes). */
  evidence: string[];
  /** The AI's concluded resume angle / draft bullet for this point. */
  resumeAngle?: string;
  source: "interview";
  updatedAt: string;
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
  /** Side / learning projects that expand the skillset, distinct from work. */
  projects?: ProfileProject[];
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
  /** Resume points expanded through the coach interview. */
  pointDetails?: ProfilePointDetail[];
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
