import { and, eq, lt, sql } from "drizzle-orm";
import type { FoundJob } from "@jobseeker/browser-agent";
import type { JobMatch, StructuredProfile } from "@jobseeker/contracts";

import { db } from "../../db";
import { jobMatches, jobs } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { logInfo } from "../../lib/log";

export interface PersistResult {
  inserted: boolean;
  jobId: string;
  score: number;
  reasons: string[];
  gaps: string[];
}

// Drop explorer jobs from prior runs once a new run has produced at least one row.
// Only deletes rows created before `cutoffIso`, so a failed/crashed run that produced
// nothing leaves the last successful result set in place.
export async function sweepStaleExplorerJobs(projectId: string, cutoffIso: string): Promise<void> {
  const stale = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.source, "explorer"),
        lt(jobs.createdAt, cutoffIso),
      ),
    )
    .all();

  for (const row of stale) {
    await db.delete(jobMatches).where(eq(jobMatches.jobId, row.id));
  }

  await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.projectId, projectId),
        eq(jobs.source, "explorer"),
        lt(jobs.createdAt, cutoffIso),
      ),
    );
}

export async function persistJobIncrementally(input: {
  projectId: string;
  profile: StructuredProfile | null;
  job: FoundJob;
  seenUrls: Set<string>;
}): Promise<PersistResult | null> {
  const normalizedUrl = normalizeAbsoluteUrl(input.job.url);
  if (!normalizedUrl) return null;
  const key = normalizedUrl.toLowerCase();
  if (!key) return null;
  if (input.seenUrls.has(key)) return null;
  input.seenUrls.add(key);

  const scoreResult = input.profile
    ? calculateScore(input.job, input.profile)
    : { total: 0.5, components: null };
  const score = scoreResult.total;
  const reasons = input.profile
    ? buildReasons(input.job, input.profile)
    : ["General match from explorer"];
  const gaps = input.profile ? buildGaps(input.job, input.profile) : [];
  const createdAt = new Date().toISOString();
  const jobId = makeId("job");

  const inserted = await db
    .insert(jobs)
    .values({
      id: jobId,
      projectId: input.projectId,
      source: "explorer",
      title: input.job.title,
      company: input.job.company,
      location: input.job.location,
      url: normalizedUrl,
      summary: input.job.summary,
      salary: input.job.salary ?? null,
      createdAt,
    })
    .onConflictDoNothing({ target: [jobs.projectId, jobs.source, jobs.url] })
    .returning({ id: jobs.id })
    .all();

  const resolvedJobId = inserted[0]?.id;
  if (!resolvedJobId) {
    // Conflict with a prior row (e.g., same URL inserted concurrently). Skip match upsert
    // rather than colliding on a different jobId — the original row's match stands.
    return null;
  }

  if (process.env.EXPLORER_DEBUG_SCORING === "true" && scoreResult.components) {
    logInfo("explorer job scored", {
      jobId: resolvedJobId,
      url: normalizedUrl,
      total: score,
      ...scoreResult.components,
    });
  }

  const match: JobMatch = {
    jobId: resolvedJobId,
    projectId: input.projectId,
    score,
    reasons,
    gaps,
  };

  await db
    .insert(jobMatches)
    .values({
      jobId: match.jobId,
      projectId: match.projectId,
      score: match.score,
      reasonsJson: JSON.stringify(match.reasons),
      gapsJson: JSON.stringify(match.gaps),
    })
    .onConflictDoUpdate({
      target: [jobMatches.jobId, jobMatches.projectId],
      set: {
        score: sql`excluded.score`,
        reasonsJson: sql`excluded.reasons_json`,
        gapsJson: sql`excluded.gaps_json`,
      },
    });

  return {
    inserted: true,
    jobId: resolvedJobId,
    score,
    reasons,
    gaps,
  };
}

function normalizeAbsoluteUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

interface ScoreComponents {
  roleHit: number;
  skillHits: number;
  keywordHits: number;
  locationHit: number;
  experienceHits: number;
  industryHits: number;
  avoidIndustryHit: boolean;
}

function calculateScore(
  job: FoundJob,
  profile: StructuredProfile,
): { total: number; components: ScoreComponents } {
  const haystack = `${job.title} ${job.summary} ${job.company}`.toLowerCase();
  const companyHaystack = job.company.toLowerCase();
  const roleTerms = profile.targeting.roles.map((role) => role.title.toLowerCase());
  const skillTerms = profile.skills.map((skill) => skill.name.toLowerCase()).slice(0, 12);
  const keywordTerms = profile.searchContext.effectiveKeywords.map((term) => term.toLowerCase());
  const locationTerms = profile.targeting.locations
    .flatMap((entry) => [entry.city, entry.state, entry.country])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const roleHit = roleTerms.some((term) => haystack.includes(term)) ? 0.35 : 0;
  const skillHits = skillTerms.filter((term) => haystack.includes(term)).length;
  const keywordHits = keywordTerms.filter((term) => haystack.includes(term)).length;
  const locationHit = locationTerms.some(
    (term) => job.location.toLowerCase().includes(term) || job.summary.toLowerCase().includes(term),
  )
    ? 0.1
    : 0;

  const experienceHits = profile.experiences.slice(0, 8).filter((exp) => {
    const company = exp.company.trim().toLowerCase();
    const title = exp.title.trim().toLowerCase();
    return (
      (company.length > 2 && (companyHaystack.includes(company) || haystack.includes(company))) ||
      (title.length > 2 && haystack.includes(title))
    );
  }).length;

  const industries = profile.targeting.companyPreference.industries.map((i) => i.toLowerCase());
  const avoidIndustries = profile.targeting.companyPreference.avoidIndustries.map((i) =>
    i.toLowerCase(),
  );
  const industryHits = industries.filter((term) => term && haystack.includes(term)).length;
  const avoidIndustryHit = avoidIndustries.some((term) => term && haystack.includes(term));

  const skillScore = Math.min(0.3, skillHits * 0.05);
  const keywordScore = Math.min(0.2, keywordHits * 0.05);
  const experienceScore = Math.min(0.1, experienceHits * 0.05);
  const industryScore = Math.min(0.1, industryHits * 0.05);
  const avoidIndustryPenalty = avoidIndustryHit ? -0.15 : 0;

  const base = 0.15;
  const total =
    base +
    roleHit +
    skillScore +
    keywordScore +
    locationHit +
    experienceScore +
    industryScore +
    avoidIndustryPenalty;
  const clamped = Math.max(0.05, Math.min(0.98, Number(total.toFixed(2))));

  return {
    total: clamped,
    components: {
      roleHit,
      skillHits,
      keywordHits,
      locationHit,
      experienceHits,
      industryHits,
      avoidIndustryHit,
    },
  };
}

function buildReasons(job: FoundJob, profile: StructuredProfile): string[] {
  const out: string[] = [];
  const haystack = `${job.title} ${job.summary}`.toLowerCase();
  const companyHaystack = job.company.toLowerCase();

  for (const role of profile.targeting.roles.slice(0, 3)) {
    if (haystack.includes(role.title.toLowerCase())) {
      out.push(`Role alignment: ${role.title}`);
    }
  }

  for (const skill of profile.skills.slice(0, 6)) {
    if (haystack.includes(skill.name.toLowerCase())) {
      out.push(`Mentions skill: ${skill.name}`);
    }
  }

  const industries = profile.targeting.companyPreference.industries;
  for (const industry of industries.slice(0, 3)) {
    if (industry && haystack.includes(industry.toLowerCase())) {
      out.push(`Preferred industry: ${industry}`);
    }
  }

  for (const exp of profile.experiences.slice(0, 5)) {
    const company = exp.company.trim();
    if (company.length > 2 && companyHaystack.includes(company.toLowerCase())) {
      out.push(`Overlap with prior company: ${company}`);
      break;
    }
  }

  // Matches user-stated preferences from memory. Skip free-form clarifications —
  // they're phrased as Q&A and too noisy for substring matching.
  const preferences = profile.memory.discoveredPreferences.filter(
    (entry) => entry.source === "question" || entry.source === "discovery",
  );
  for (const pref of preferences.slice(0, 3)) {
    const text = pref.preference.trim().toLowerCase();
    if (text.length > 3 && haystack.includes(text)) {
      out.push(`Matches stated preference: ${pref.preference}`);
    }
  }

  if (out.length === 0) {
    out.push("General alignment based on search query and profile context");
  }

  return out.slice(0, 5);
}

// Extracts the first number followed by optional "k" and treats it as the lower
// bound of the listing's salary in the profile's currency. Returns null when no
// number can be found — the job.salary field is free-form so parsing is best-effort.
function parseSalaryFloor(raw: string): number | null {
  const match = raw.match(/(\d[\d,.]*)\s*(k)?/i);
  if (!match) return null;
  const numeric = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return match[2] ? numeric * 1000 : numeric;
}

function buildGaps(job: FoundJob, profile: StructuredProfile): string[] {
  const out: string[] = [];
  const haystack = `${job.title} ${job.summary}`.toLowerCase();

  const topSkills = profile.skills.slice(0, 6);
  const missingSkills = topSkills.filter((skill) => !haystack.includes(skill.name.toLowerCase()));

  if (missingSkills.length >= 3) {
    out.push("Key profile skills are not clearly mentioned in this listing");
  }

  const wantsRemote = profile.targeting.locations.some((entry) => entry.remote === "full");
  const jobMentionsRemote =
    haystack.includes("remote") || job.location.toLowerCase().includes("remote");
  if (wantsRemote && !jobMentionsRemote) {
    out.push("Remote preference may not match this role");
  }

  const expectedMin = profile.targeting.salaryExpectation?.min;
  if (expectedMin && job.salary) {
    const jobFloor = parseSalaryFloor(job.salary);
    if (jobFloor !== null && jobFloor < expectedMin) {
      out.push("Below expected salary floor");
    }
  }

  const yoe = profile.identity.yearsOfExperience;
  const seniorSignal = /\b(senior|staff|principal|lead)\b/i.test(`${job.title} ${job.summary}`);
  if (seniorSignal && typeof yoe === "number" && yoe < 5) {
    out.push("Seniority may not match");
  }

  return out.slice(0, 3);
}
