import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { StructuredProfile } from "@jobseeker/contracts";

import { db } from "../db";
import { documents, jobMatches, jobs, profiles, projects } from "../db/schema";
import { createProject, ensureProjectSlugs } from "../services/projects/bootstrap";
import { writeProfileFile } from "../services/projects/profile";
import { buildProjectSnapshot, isDefined } from "../services/projects/snapshot";

const now = () => new Date().toISOString();

export function registerProjectRoutes(app: Hono) {
  app.get("/api/projects", async (c) => {
    await ensureProjectSlugs();
    const projectRows = await db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
    const snapshots = await Promise.all(
      projectRows.map((project) => buildProjectSnapshot(project.id)),
    );

    return c.json({ projects: snapshots.filter(isDefined) });
  });

  app.post("/api/projects", async (c) => {
    const input = (await c.req.json()) as { title: string };
    const { projectId } = await createProject(input.title);

    const snapshot = await buildProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot, 201);
  });

  app.get("/api/projects/:projectId", async (c) => {
    await ensureProjectSlugs();
    const projectIdOrSlug = c.req.param("projectId");

    let snapshot = await buildProjectSnapshot(projectIdOrSlug);
    if (!snapshot) {
      const project = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.slug, projectIdOrSlug))
        .get();

      if (project) {
        snapshot = await buildProjectSnapshot(project.id);
      }
    }

    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });

  app.get("/api/projects/:projectId/documents/:documentId", async (c) => {
    const { projectId, documentId } = c.req.param();

    const document = await db.select().from(documents).where(eq(documents.id, documentId)).get();

    if (!document || document.projectId !== projectId) {
      return c.json({ error: "Document not found." }, 404);
    }

    const content =
      document.content ??
      (await Bun.file(document.path)
        .text()
        .catch(() => null));

    return c.json({ document: { ...document, content } });
  });

  app.put("/api/projects/:projectId/documents/:documentId", async (c) => {
    const { projectId, documentId } = c.req.param();
    const body = (await c.req.json()) as { content: string };

    const document = await db.select().from(documents).where(eq(documents.id, documentId)).get();

    if (!document || document.projectId !== projectId) {
      return c.json({ error: "Document not found." }, 404);
    }

    await db
      .update(documents)
      .set({ content: body.content })
      .where(eq(documents.id, documentId))
      .run();

    if (document.path) {
      await Bun.write(document.path, body.content).catch(() => null);
    }

    return c.json({ document: { ...document, content: body.content } });
  });

  app.get("/api/projects/:projectId/profile", async (c) => {
    const projectId = c.req.param("projectId");
    const profile = await db.select().from(profiles).where(eq(profiles.projectId, projectId)).get();

    return c.json({ profile: profile ? JSON.parse(profile.profileJson) : null });
  });

  app.put("/api/projects/:projectId/profile", async (c) => {
    const projectId = c.req.param("projectId");
    const profileData = (await c.req.json()) as StructuredProfile;
    const timestamp = now();

    await db
      .insert(profiles)
      .values({
        projectId,
        profileJson: JSON.stringify(profileData),
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: profiles.projectId,
        set: {
          profileJson: JSON.stringify(profileData),
          updatedAt: timestamp,
        },
      })
      .run();

    await writeProfileFile(projectId, profileData);

    const snapshot = await buildProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });

  app.delete("/api/projects/:projectId/jobs/:jobId", async (c) => {
    const { projectId, jobId } = c.req.param();

    // Verify the job belongs to this project
    const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();

    if (!job || job.projectId !== projectId) {
      return c.json({ error: "Job not found." }, 404);
    }

    // Delete job matches first (cascade should handle this, but being explicit)
    await db.delete(jobMatches).where(eq(jobMatches.jobId, jobId));

    // Delete the job
    await db.delete(jobs).where(eq(jobs.id, jobId));

    const snapshot = await buildProjectSnapshot(projectId);
    if (!snapshot) {
      return c.json({ error: "Project not found." }, 404);
    }

    return c.json(snapshot);
  });
}
