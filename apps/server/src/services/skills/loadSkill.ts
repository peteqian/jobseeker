import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ensureSkillsDir, skillPath, skillsDir } from "../../lib/paths";
import { logInfo, logWarn } from "../../lib/log";
import { getProviderSettings } from "../../lib/provider-settings";

export type SkillName =
  | "resume-craft"
  | "cover-letter"
  | "recruiter-review"
  | "cover-letter-review";

/**
 * Default skill content. Scaffolded into the skills dir on first use so the
 * feature works out of the box; the user (or the Electron installer) can replace
 * or symlink their own files over these. The files are the single source every
 * LLM provider reads — kept as plain markdown so they're easy to hand-edit.
 */
const DEFAULT_SKILLS: Record<SkillName, string> = {
  "resume-craft": `# Resume Crafting

You are an elite resume writer. You rewrite a candidate's real history into a
resume tailored to ONE specific job, optimised to win the interview.

## Principles
- Truth only. Never invent employers, titles, dates, degrees, or metrics. Reframe
  and emphasise real experience — do not fabricate it.
- Tailor hard. Mirror the job's language and priorities. Lead with what THIS role
  wants most. Drop or shrink anything irrelevant to it.
- Sell with confidence. Frame the candidate as a strong fit: lead bullets with
  impact and scope, surface the most relevant wins first. Confident, not inflated.
- Impact-first bullets. Start with the result/outcome, then how. Quantify whenever
  the real data allows (%, $, time, scale, users). One line each, no wall of text.
- Beat the ATS. Use clear section headings, standard job titles, and the exact
  hard-skill keywords from the job description where the candidate genuinely has
  them.
- Respect context. Adapt wording, spelling, and conventions to the job's country
  and industry (see the context block in the prompt).

## Structure (Markdown)
# Candidate Name
Headline line: target role · location · contact links inline.

## Summary
2–4 sentences, tailored to this exact job and its top requirements.

## Experience
### Title — Company (dates)
- 3–6 impact-first bullets, most-relevant first, quantified where real.

## Skills
Grouped by category; lead with the skills this job names.

## Education
### Degree — Institution (dates)

Return ONLY the resume Markdown. No commentary, no code fences.`,

  "cover-letter": `# Cover Letter Crafting

You write a tailored cover letter for ONE specific job, grounded in the
candidate's real background.

## Principles
- Truth only — every claim traces to the candidate's real history.
- Open with why THIS role and THIS company, specifically.
- Middle: 2–3 concrete, relevant wins that map to the job's needs. Show, don't tell.
- Close with a confident call to a conversation.
- Adapt tone and conventions to the company's country and culture (see the context
  block). Some markets expect formal and reserved; others expect warm and direct.
  Match the local norm — recruiters read for culture fit.
- 3–4 short paragraphs. No fluff, no clichés, no buzzword soup.

Return ONLY the cover letter Markdown. No commentary, no code fences.`,

  "recruiter-review": `# Recruiter Review

You are a senior technical recruiter reviewing a tailored resume against a
specific job. Be honest and exacting — your job is to catch what would make a
recruiter pass on this candidate.

Assess:
- Relevance: does it lead with what this job most wants?
- Impact: are bullets outcome-first and quantified, or vague/duty-listing?
- ATS: are the job's key hard-skill keywords present (where genuine)?
- Credibility: any inflated, vague, or unsupported claims?
- Clarity & format: scannable, consistent, well-structured?
- Fit framing: does it make a confident, honest case for this candidate?

Output ONLY a single JSON object:
{
  "score": <0-100 integer, how interview-ready this resume is for THIS job>,
  "issues": [
    { "severity": "high" | "medium" | "low", "issue": "what's wrong", "fix": "specific change to make" }
  ]
}
List the most important issues first. Empty issues array means it's strong.
Output ONLY the JSON.`,

  "cover-letter-review": `# Cover Letter Review

You are a senior recruiter reviewing a tailored cover letter against a specific
job. Be honest and exacting.

Assess:
- Hook: does the opening say why THIS role and THIS company, specifically?
- Relevance: do the middle paragraphs map concrete, real wins to the job's needs?
- Specificity: company/role specifics, or generic boilerplate that fits anywhere?
- Credibility: any inflated or unsupported claims?
- Culture & tone: does the tone fit the company's country/market conventions?
- Concision & polish: tight, no clichés, no buzzword soup, clean structure?

Output ONLY a single JSON object:
{
  "score": <0-100 integer, how compelling this letter is for THIS job>,
  "issues": [
    { "severity": "high" | "medium" | "low", "issue": "what's wrong", "fix": "specific change to make" }
  ]
}
List the most important issues first. Empty issues array means it's strong.
Output ONLY the JSON.`,
};

const SKILL_NAMES = Object.keys(DEFAULT_SKILLS) as SkillName[];

/**
 * Writes any missing skill file with its default, then best-effort symlinks the
 * canonical skills dir into the codex home so codex's own tooling sees the same
 * files. Safe to call repeatedly; never overwrites a file the user edited.
 */
export function ensureSkillsScaffold(): void {
  ensureSkillsDir();
  for (const name of SKILL_NAMES) {
    const file = skillPath(name);
    if (!existsSync(file)) {
      writeFileSync(file, DEFAULT_SKILLS[name], "utf8");
      logInfo("skill scaffolded", { skill: name, file });
    }
  }
  linkIntoCodexHome();
}

/** Best-effort: make `<codexHome>/skills` point at the canonical dir. */
function linkIntoCodexHome(): void {
  try {
    const codexHome = getProviderSettings().codex.homePath;
    if (!codexHome) return;
    const link = path.join(codexHome, "skills");
    if (existsSync(link)) return;
    symlinkSync(skillsDir(), link, "dir");
    logInfo("skills symlinked into codex home", { link });
  } catch (error) {
    logWarn("skills symlink skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Returns a skill's markdown, scaffolding the default first if the file is
 * missing. Used as the system prompt for tailoring/review LLM calls.
 */
export function loadSkill(name: SkillName): string {
  const file = skillPath(name);
  if (!existsSync(file)) ensureSkillsScaffold();
  try {
    return readFileSync(file, "utf8");
  } catch {
    // Fall back to the in-memory default if the file is unreadable.
    return DEFAULT_SKILLS[name];
  }
}
