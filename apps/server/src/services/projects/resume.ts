import { desc, eq } from "drizzle-orm";

import { db } from "../../db";
import { documents, projects } from "../../db/schema";

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
