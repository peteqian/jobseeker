import { mkdirSync } from "node:fs";
import path from "node:path";

import { dataDir } from "../env";

export type ProjectScope = "coach" | "explorer" | "apply";

// ---------------------------------------------------------------------------
// Project directories
// ---------------------------------------------------------------------------

/**
 * Single Chrome profile shared by every browser-driven feature (explorer,
 * apply). One sign-in to a site persists across all of them. The explorer runs
 * one browser at a time by default, so concurrent access to this profile is not
 * a concern; raise `EXPLORER_CONCURRENCY` only for sites that need no login.
 */
export function browserProfileDir() {
  return path.join(dataDir, "browser-profiles", "shared");
}

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

export function scopeDir(projectSlug: string, scope: ProjectScope) {
  return projectPath(projectSlug, scope);
}

export function ensureScopeDir(projectSlug: string, scope: ProjectScope) {
  const dir = scopeDir(projectSlug, scope);
  mkdirSync(dir, { recursive: true });
  return dir;
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
