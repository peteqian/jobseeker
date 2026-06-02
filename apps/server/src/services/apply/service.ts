import { eq } from "drizzle-orm";
import type { ChatModelSelection } from "@jobseeker/contracts";

import { db } from "../../db";
import { projects } from "../../db/schema";
import { createProjectSlug } from "../../lib/paths";
import { getProviderSettings } from "../../lib/provider-settings";
import { seedAnswersFromProfile } from "./answers";
import { readProjectProfile } from "../projects/profile";
import { runApply, type ApplyResult } from "./runtime";

/**
 * Resolves everything `runApply` needs from a projectId + job URL (project slug,
 * profile, codex provider settings, model/effort) and runs one human-gated
 * application. Mirrors `runExplorerDiscovery`'s resolution.
 *
 * Seeds the answer store from the profile first so the agent has the user's
 * work-rights and identity answers available on the first apply.
 */
export async function runApplyForJob(input: {
  projectId: string;
  jobUrl: string;
  modelSelection?: ChatModelSelection;
}): Promise<ApplyResult> {
  const project = await db.select().from(projects).where(eq(projects.id, input.projectId)).get();
  if (!project) return { status: "failed", reason: "project not found" };

  const profile = await readProjectProfile(input.projectId);
  if (!profile) return { status: "failed", reason: "no profile built for project" };

  await seedAnswersFromProfile(input.projectId, profile);

  const slug = project.slug ?? createProjectSlug(project.title, project.id);
  const provider = getProviderSettings();
  const model =
    input.modelSelection?.model ||
    process.env.APPLY_MODEL ||
    process.env.EXPLORER_MODEL ||
    "gpt-5.3-codex";
  const effort =
    input.modelSelection?.effort ||
    process.env.APPLY_EFFORT ||
    process.env.EXPLORER_EFFORT ||
    "medium";

  // v1 runs to completion (or human-submit pause) without external cancellation.
  const controller = new AbortController();

  return runApply({
    projectId: input.projectId,
    projectSlug: slug,
    jobUrl: input.jobUrl,
    profile,
    model,
    effort,
    codexBinaryPath: provider.codex.binaryPath,
    codexAuthHome: provider.codex.homePath,
    signal: controller.signal,
    modelSelection: input.modelSelection,
  });
}
