import { desc, eq } from "drizzle-orm";

import { db } from "../../db";
import { documents, projects } from "../../db/schema";

/**
 * Returns the best resume text currently available for a project.
 *
 * We prefer extracted text, then fall back to the active source document if no
 * separate extracted row exists.
 */
export async function getProjectResumeText(projectId: string): Promise<string | null> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return null;
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt))
    .all();

  const activeResume = docs.find(
    (document) => document.kind === "resume_source" && document.id === project.activeResumeSourceId,
  );
  const extractedResume = docs.find((document) => document.kind === "extracted_text");

  return (extractedResume?.content ?? activeResume?.content ?? "").trim() || null;
}
