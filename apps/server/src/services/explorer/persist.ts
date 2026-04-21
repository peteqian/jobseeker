import { and, eq, lt, sql } from "drizzle-orm";
import type { JobMatch, StructuredProfile } from "@jobseeker/contracts";

import { db } from "../../db";
import { jobMatches, jobs } from "../../db/schema";
import { makeId } from "../../lib/ids";

export interface FoundJob {
  title: string;
  company: string;
  location: string;
  url: string;
  summary: string;
  salary?: string;
}

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
  const key = input.job.url.trim().toLowerCase();
  if (!key) return null;
  if (input.seenUrls.has(key)) return null;
  input.seenUrls.add(key);

  const score = input.profile ? calculateScore(input.job, input.profile) : 0.5;
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
      url: input.job.url,
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

function calculateScore(job: FoundJob, profile: StructuredProfile): number {
  const haystack = `${job.title} ${job.summary} ${job.company}`.toLowerCase();
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

  const skillScore = Math.min(0.3, skillHits * 0.05);
  const keywordScore = Math.min(0.2, keywordHits * 0.05);
  const base = 0.15;
  const total = base + roleHit + skillScore + keywordScore + locationHit;

  return Math.max(0.05, Math.min(0.98, Number(total.toFixed(2))));
}

function buildReasons(job: FoundJob, profile: StructuredProfile): string[] {
  const out: string[] = [];
  const haystack = `${job.title} ${job.summary}`.toLowerCase();

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

  if (out.length === 0) {
    out.push("General alignment based on search query and profile context");
  }

  return out.slice(0, 5);
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

  return out.slice(0, 3);
}
