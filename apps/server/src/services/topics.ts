import { mkdirSync } from "node:fs";

import { projectPath } from "../lib/paths";

export function topicsDir(projectSlug: string) {
  return projectPath(projectSlug, "topics");
}

export function topicPath(projectSlug: string, slug: string) {
  return projectPath(projectSlug, "topics", `${slug}.md`);
}

export async function writeTopicFile(projectSlug: string, slug: string, content: string) {
  mkdirSync(topicsDir(projectSlug), { recursive: true });
  await Bun.write(topicPath(projectSlug, slug), content);
}

export async function readTopicFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return "";
  }

  return file.text();
}

export function emptyTopicMarkdown(title: string): string {
  return `# ${title}

## Evidence collected
- (none yet)

## Why it matters
- (none yet)

## Pushback
- (none yet)

## Follow-ups remaining
- (none yet)

## Conclusion / resume angle
(not yet concluded)
`;
}
