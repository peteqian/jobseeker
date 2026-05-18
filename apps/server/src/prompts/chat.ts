import type { StructuredProfile, TopicFileMeta } from "@jobseeker/contracts";

interface TopicWithContent extends TopicFileMeta {
  content: string;
}

interface PromptContext {
  resumeText: string | null;
  profile: StructuredProfile | null;
  topics: TopicWithContent[];
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

  return parts.join("\n\n");
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

export function stripTopicMarkers(text: string): string {
  return text
    .replace(TOPIC_UPDATE_PATTERN, "")
    .replace(TOPIC_CREATE_PATTERN, "")
    .replace(PROFILE_COMPLETE_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
