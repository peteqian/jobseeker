import type { CoachClaim, StructuredProfile, TopicFileMeta } from "@jobseeker/contracts";

interface TopicWithContent extends TopicFileMeta {
  content: string;
}

/**
 * Drives the interview through specific resume points. `claims` are ordered by
 * priority (weakest first); `currentClaimId` is the point the thread is
 * anchored to, if any.
 */
export interface InterviewAgenda {
  claims: CoachClaim[];
  currentClaimId?: string;
}

/** Latest recruiter verdict for a tailored document, shown to the assistant. */
export interface TailoringReviewContext {
  jobTitle: string;
  company: string;
  kind: string;
  /** Presentation quality of the document given the candidate's real background. */
  score: number;
  /** Candidate-vs-role fit; null on reviews from before the fit/presentation split. */
  fitScore: number | null;
  shortlist: string | null;
  /** Unfixable candidate-vs-role mismatches stated as facts. */
  gaps: string[];
  issues: { severity: string; issue: string; fix: string }[];
  createdAt: string;
}

interface PromptContext {
  resumeText: string | null;
  profile: StructuredProfile | null;
  topics: TopicWithContent[];
  agenda?: InterviewAgenda;
  tailoringReviews?: TailoringReviewContext[];
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  parts.push(`You are a direct, no-nonsense career coach running a structured interview to help a job seeker build a strong resume.

Your job:
- Drive a questionnaire-style interview. Pick one topic at a time and probe for concrete evidence.
- Ask pointed follow-up questions. If someone says "led a team," ask how many people, what the outcome was, what decisions they actually made.
- Push back on vague or inflated claims. Be honest when evidence is thin.
- Keep responses focused and conversational. No long monologues. One or two questions per message.
- When you have enough evidence on a topic, write a conclusion and move to the next topic.

## Profile building goal

Your secondary goal is to ensure the user's StructuredProfile is complete. You should specifically probe for:
- Identity: name, headline, years of experience, a strong professional summary.
- Experiences: concrete achievements with metrics, skills used, scope of ownership.
- Skills: every relevant technical, domain, soft, and tool skill with honest level estimates.
- Targeting: desired roles with level and priority, preferred locations and remote stance, company size/stage/industry preferences.
- Search context: effective keywords a recruiter would use to find this person.

When you believe you have enough evidence to populate all of the above fields confidently, emit this marker at the very end of your response (after any topic markers):

<!-- profile-complete -->

Only emit this marker once you are genuinely confident the profile is complete. Do not emit it prematurely.

## Editing the profile

When the user asks you to add a side or learning project to their profile — or the two of you clearly establish a new project worth recording — add it by emitting this marker at the very end of your response (after any topic markers):

<!-- profile-project-add: {"name": "Project name", "description": "1-3 sentence description of what it is and what the user did", "skillsUsed": ["Skill A", "Skill B"], "url": "https://optional-link"} -->

Rules for profile-project-add markers:
- Only add a project the user actually described. Do not invent details.
- The content must be valid JSON; use \\n for any newlines inside string values. url is optional.
- In your conversational text, confirm to the user what you added.
- If a project with the same name already exists, this updates it in place.

## How topics work

You maintain topic files — short markdown documents that track what you've learned about each area of the user's experience. Each topic has sections: Evidence collected, Why it matters, Pushback, Follow-ups remaining, and Conclusion / resume angle.

After each exchange where you learn something new, update the relevant topic by embedding a marker in your response:

To update an existing topic:
<!-- topic-update: {"slug": "the-slug", "title": "Topic Title", "status": "in-progress", "content": "# Topic Title\\n\\n## Evidence collected\\n- point one\\n- point two\\n\\n## Why it matters\\n- reason\\n\\n## Pushback\\n- concern\\n\\n## Follow-ups remaining\\n- question\\n\\n## Conclusion / resume angle\\n(not yet concluded)"} -->

To create a new topic:
<!-- topic-create: {"slug": "new-slug", "title": "New Topic", "content": "# New Topic\\n\\n## Evidence collected\\n- (none yet)\\n\\n## Why it matters\\n- (none yet)\\n\\n## Pushback\\n- (none yet)\\n\\n## Follow-ups remaining\\n- (none yet)\\n\\n## Conclusion / resume angle\\n(not yet concluded)"} -->

Rules for topic files:
- Keep each file under 70 lines. Be concise.
- Use "in-progress" status while still probing. Set "complete" when you have a conclusion.
- When a topic is too broad, split it: create a new topic for the subtopic.
- Only emit markers when you actually learned something new or need to update the file.
- Place markers at the very end of your response, after your conversational text.
- The content field must use \\n for newlines (it's JSON).

## Interview flow

1. If no topics exist yet, look at the resume and create 2-3 initial topics for the strongest areas worth probing.
2. Focus on one topic at a time. Ask 1-2 specific questions per message.
3. When a topic has enough evidence, write a conclusion with a draft resume bullet point, mark it "complete", and move on.
4. If the user mentions something that doesn't fit an existing topic, create a new one.`);

  if (ctx.resumeText) {
    parts.push(`<resume>
${ctx.resumeText}
</resume>`);
  }

  if (ctx.profile) {
    parts.push(`<profile>
${JSON.stringify(ctx.profile, null, 2)}
</profile>`);
  }

  if (ctx.topics.length > 0) {
    const topicBlocks = ctx.topics.map(
      (t) => `<topic slug="${t.slug}" status="${t.status}">\n${t.content}\n</topic>`,
    );
    parts.push(`<topics>
${topicBlocks.join("\n\n")}
</topics>`);
  }

  if (ctx.agenda && ctx.agenda.claims.length > 0) {
    parts.push(buildAgendaSection(ctx.agenda));
  }

  if (ctx.tailoringReviews && ctx.tailoringReviews.length > 0) {
    parts.push(`## Tailored document reviews

The user generates AI-tailored resumes and cover letters per job; each one is screened by an automated recruiter review with two separate judgments: \`score\` is presentation quality — how well the document sells the user's real background (editable, target 90+) — and \`fitScore\` is candidate-vs-role fit from facts alone (NOT fixable by editing; the \`gaps\` list says why). \`shortlist\` is the recruiter's advance/pass call. When the user asks about a document or score, keep these apart: presentation issues are fixed by editing; fit gaps mean the job itself is a stretch — coach them on job choice or on genuinely closing the gap, never on stretching the resume.

<tailoring-reviews>
${JSON.stringify(ctx.tailoringReviews, null, 2)}
</tailoring-reviews>`);
  }

  return parts.join("\n\n");
}

/**
 * Renders the driven-interview agenda: the resume points to walk in order, the
 * point currently in focus, and the `point-detail` marker the model emits once
 * it has gathered enough to expand a point.
 */
function buildAgendaSection(agenda: InterviewAgenda): string {
  const lines = agenda.claims.map((claim, index) => {
    const marker = claim.id === agenda.currentClaimId ? " ← current" : "";
    return `${index + 1}. [${claim.status}] "${claim.text}" (claimId: ${claim.id})${marker}`;
  });

  return `## Interview agenda — drive this session

You are running a DRIVEN interview. Walk the resume points below one at a time, in the order listed (weakest claims first). They are the agenda for this session.

${lines.join("\n")}

For the current point:
- Open with "You wrote '<the claim text>'." then ask what they actually did — the scope, the decisions they made, the measurable outcome, who was involved.
- Ask 1-2 pointed follow-ups until you have concrete evidence, not vague claims.
- When you have enough to expand the point, emit a point-detail marker (below), then advance to the next unfinished point and name it.

Emit this marker at the very end of your response (after any topic markers) once you've gathered enough on a point:

<!-- point-detail: {"claimId": "the-claim-id", "originalText": "the original resume line", "expandedDetail": "the richer story in 2-4 sentences", "evidence": ["metric or fact one", "metric or fact two"], "resumeAngle": "a tightened draft resume bullet"} -->

Rules for point-detail markers:
- Only emit when you have real, specific evidence for that point.
- The content must be valid JSON; use \\n for any newlines inside string values.
- Set claimId to the claimId from the agenda when expanding an agenda point.`;
}

// ---------------------------------------------------------------------------
// Topic marker parsing
// ---------------------------------------------------------------------------

const TOPIC_UPDATE_PATTERN = /<!--\s*topic-update:\s*(\{[\s\S]*?\})\s*-->/g;
const TOPIC_CREATE_PATTERN = /<!--\s*topic-create:\s*(\{[\s\S]*?\})\s*-->/g;

export interface ParsedTopicUpdate {
  kind: "update" | "create";
  slug: string;
  title: string;
  status: "in-progress" | "complete";
  content: string;
}

export function parseTopicUpdates(text: string): ParsedTopicUpdate[] {
  const results: ParsedTopicUpdate[] = [];

  for (const match of text.matchAll(TOPIC_UPDATE_PATTERN)) {
    const parsed = tryParseTopicMarker(match[1], "update");
    if (parsed) results.push(parsed);
  }

  for (const match of text.matchAll(TOPIC_CREATE_PATTERN)) {
    const parsed = tryParseTopicMarker(match[1], "create");
    if (parsed) results.push(parsed);
  }

  return results;
}

function tryParseTopicMarker(json: string, kind: "update" | "create"): ParsedTopicUpdate | null {
  try {
    const raw = JSON.parse(json);

    if (!raw.slug || !raw.content) return null;

    const status = raw.status === "complete" ? "complete" : "in-progress";

    return {
      kind,
      slug: raw.slug,
      title: raw.title || raw.slug,
      status,
      content: raw.content,
    };
  } catch {
    return null;
  }
}

const PROFILE_COMPLETE_PATTERN = /<!--\s*profile-complete\s*-->/g;

export function parseProfileCompleteMarker(text: string): boolean {
  return PROFILE_COMPLETE_PATTERN.test(text);
}

const POINT_DETAIL_PATTERN = /<!--\s*point-detail:\s*(\{[\s\S]*?\})\s*-->/g;

export interface ParsedPointDetail {
  claimId?: string;
  originalText: string;
  expandedDetail: string;
  evidence: string[];
  resumeAngle?: string;
}

/** Extracts point-detail markers emitted by the driven interview. */
export function parsePointDetails(text: string): ParsedPointDetail[] {
  const results: ParsedPointDetail[] = [];

  for (const match of text.matchAll(POINT_DETAIL_PATTERN)) {
    try {
      const raw = JSON.parse(match[1]) as Record<string, unknown>;
      const expandedDetail = typeof raw.expandedDetail === "string" ? raw.expandedDetail : "";
      const originalText = typeof raw.originalText === "string" ? raw.originalText : "";
      if (!expandedDetail) continue;
      results.push({
        claimId: typeof raw.claimId === "string" ? raw.claimId : undefined,
        originalText,
        expandedDetail,
        evidence: Array.isArray(raw.evidence)
          ? raw.evidence.filter((v): v is string => typeof v === "string")
          : [],
        resumeAngle: typeof raw.resumeAngle === "string" ? raw.resumeAngle : undefined,
      });
    } catch {
      // Skip malformed markers; a bad marker must not break the turn.
    }
  }

  return results;
}

const PROFILE_PROJECT_ADD_PATTERN = /<!--\s*profile-project-add:\s*(\{[\s\S]*?\})\s*-->/g;

export interface ParsedProfileProject {
  name: string;
  description: string;
  skillsUsed: string[];
  url?: string;
}

/** Extracts profile-project-add markers the assistant emits to edit the profile. */
export function parseProfileProjectAdds(text: string): ParsedProfileProject[] {
  const results: ParsedProfileProject[] = [];

  for (const match of text.matchAll(PROFILE_PROJECT_ADD_PATTERN)) {
    try {
      const raw = JSON.parse(match[1]) as Record<string, unknown>;
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!name) continue;
      results.push({
        name,
        description: typeof raw.description === "string" ? raw.description : "",
        skillsUsed: Array.isArray(raw.skillsUsed)
          ? raw.skillsUsed.filter((v): v is string => typeof v === "string")
          : [],
        url: typeof raw.url === "string" && raw.url ? raw.url : undefined,
      });
    } catch {
      // Skip malformed markers; a bad marker must not break the turn.
    }
  }

  return results;
}

export function stripTopicMarkers(text: string): string {
  return text
    .replace(TOPIC_UPDATE_PATTERN, "")
    .replace(TOPIC_CREATE_PATTERN, "")
    .replace(PROFILE_COMPLETE_PATTERN, "")
    .replace(POINT_DETAIL_PATTERN, "")
    .replace(PROFILE_PROJECT_ADD_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
