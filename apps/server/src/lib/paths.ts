import { mkdirSync } from "node:fs";
import path from "node:path";

import { dataDir } from "../env";

// ---------------------------------------------------------------------------
// Project directories
// ---------------------------------------------------------------------------

export function projectsDir() {
  return path.join(dataDir, "projects");
}

export function projectDir(projectSlug: string) {
  return path.join(projectsDir(), projectSlug);
}

export function ensureProjectDir(projectSlug: string) {
  const dir = projectDir(projectSlug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function projectPath(projectSlug: string, ...segments: string[]) {
  return path.join(projectDir(projectSlug), ...segments);
}

// ---------------------------------------------------------------------------
// Project slug
// ---------------------------------------------------------------------------

function slugifySegment(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "project";
}

function slugSuffix(projectId: string) {
  const compactId = projectId.replace(/^project_/, "");
  return compactId.slice(0, 8).toLowerCase();
}

export function createProjectSlug(title: string, projectId: string) {
  return `${slugifySegment(title)}-${slugSuffix(projectId)}`;
}
