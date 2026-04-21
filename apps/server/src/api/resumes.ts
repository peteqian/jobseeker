import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";

import { makeId } from "../lib/ids";
import { extractResumeText, getExtractedName } from "../services/resume";
import { buildProjectSnapshot } from "../services/projects/snapshot";
import { db } from "../db";
import { documents, projects } from "../db/schema";

const now = () => new Date().toISOString();

/** Saves the extracted-text companion document for an uploaded resume version. */
async function saveExtractedResume(
  projectId: string,
  name: string,
  text: string,
  createdAt: string,
) {
  const content = text.trim();

  if (!content) {
    return null;
  }

  const documentId = makeId("doc");

  await db.insert(documents).values({
    id: documentId,
    projectId,
    kind: "extracted_text",
    mimeType: "text/markdown",
    name: getExtractedName(name),
    path: `/tmp/${documentId}`,
    content,
    createdAt,
  });

  return documentId;
}

export function registerResumeRoutes(app: Hono) {
  app.post("/api/projects/:projectId/resume", async (c) => {
    const projectId = c.req.param("projectId");
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return c.json({ error: "Resume file is required." }, 400);
    }

    const timestamp = now();
    const documentId = makeId("doc");
    const extractedContent = await extractResumeText(file);

    await db.insert(documents).values({
      id: documentId,
      projectId,
      kind: "resume_source",
      mimeType: file.type || "application/octet-stream",
      name: file.name,
      path: `/tmp/${documentId}`,
      content: extractedContent,
      createdAt: timestamp,
    });

    await saveExtractedResume(projectId, file.name, extractedContent ?? "", timestamp);

    await db
      .update(projects)
      .set({ activeResumeSourceId: documentId })
      .where(eq(projects.id, projectId));

    return c.json({ documentId, name: file.name }, 201);
  });

  app.post("/api/projects/:projectId/resume/paste", async (c) => {
    const projectId = c.req.param("projectId");
    const input = (await c.req.json()) as { text?: string; name?: string };

    if (!input.text?.trim()) {
      return c.json({ error: "Resume text is required." }, 400);
    }

    const timestamp = now();
    const documentId = makeId("doc");
    const content = input.text.trim();

    await db.insert(documents).values({
      id: documentId,
      projectId,
      kind: "resume_source",
      mimeType: "text/plain",
      name: input.name || "pasted-resume.txt",
      path: `/tmp/${documentId}`,
      content,
      createdAt: timestamp,
    });

    await saveExtractedResume(projectId, input.name || "pasted-resume.txt", content, timestamp);

    await db
      .update(projects)
      .set({ activeResumeSourceId: documentId })
      .where(eq(projects.id, projectId));

    return c.json({ documentId }, 201);
  });

  app.get("/api/projects/:projectId/resume/versions", async (c) => {
    const projectId = c.req.param("projectId");

    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(desc(documents.createdAt))
      .all();

    const sourceDocs = docs.filter((document) => document.kind === "resume_source");
    const extractedDocs = docs.filter((document) => document.kind === "extracted_text");

    const versions = sourceDocs.map((source) => {
      const extractedName = getExtractedName(source.name);
      const extractedDocument =
        extractedDocs.find(
          (document) => document.name === extractedName && document.createdAt === source.createdAt,
        ) ??
        extractedDocs.find((document) => document.name === extractedName) ??
        null;

      return {
        document: source,
        extractedDocument,
        isActive: source.id === project?.activeResumeSourceId,
        uploadedAt: source.createdAt,
      };
    });

    return c.json({ versions });
  });

  app.post("/api/projects/:projectId/resume/activate", async (c) => {
    const projectId = c.req.param("projectId");
    const { documentId } = (await c.req.json()) as { documentId: string };

    if (!documentId) {
      return c.json({ error: "documentId is required." }, 400);
    }

    await db
      .update(projects)
      .set({ activeResumeSourceId: documentId })
      .where(eq(projects.id, projectId));

    const snapshot = await buildProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });

  app.delete("/api/projects/:projectId/resume/:documentId", async (c) => {
    const projectId = c.req.param("projectId");
    const documentId = c.req.param("documentId");

    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

    if (!project) {
      return c.json({ error: "Project not found." }, 404);
    }

    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(desc(documents.createdAt))
      .all();

    const sourceDoc = docs.find(
      (document) => document.id === documentId && document.kind === "resume_source",
    );

    if (!sourceDoc) {
      return c.json({ error: "Resume not found." }, 404);
    }

    const extractedDoc = docs.find(
      (document) =>
        document.kind === "extracted_text" &&
        document.name === getExtractedName(sourceDoc.name) &&
        document.createdAt === sourceDoc.createdAt,
    );

    await db.delete(documents).where(eq(documents.id, sourceDoc.id));

    if (extractedDoc) {
      await db.delete(documents).where(eq(documents.id, extractedDoc.id));
    }

    const remainingSource = docs.find(
      (document) => document.kind === "resume_source" && document.id !== sourceDoc.id,
    );
    const nextActiveResumeSourceId =
      project.activeResumeSourceId === sourceDoc.id
        ? (remainingSource?.id ?? null)
        : project.activeResumeSourceId;

    await db
      .update(projects)
      .set({ activeResumeSourceId: nextActiveResumeSourceId })
      .where(eq(projects.id, projectId));

    const snapshot = await buildProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });
}
