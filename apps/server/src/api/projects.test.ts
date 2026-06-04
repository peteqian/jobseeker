import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { ProjectSnapshot } from "@jobseeker/contracts";

import { db } from "../db";
import { jobs, projects } from "../db/schema";
import { registerProjectRoutes } from "./projects";

const app = new Hono();
registerProjectRoutes(app);

const projectId = "proj-app-test";
const jobId = "job-app-test";

beforeAll(async () => {
  const timestamp = new Date().toISOString();
  await db
    .insert(projects)
    .values({
      id: projectId,
      slug: "app-test",
      title: "Application tracking test",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  await db
    .insert(jobs)
    .values({
      id: jobId,
      projectId,
      source: "explorer",
      title: "Engineer",
      company: "Acme",
      location: "Remote",
      url: "https://example.com/job",
      summary: "A role",
      createdAt: timestamp,
    })
    .run();
});

describe("job application routes", () => {
  test("PUT creates a tracked application with defaults", async () => {
    const response = await app.request(`/api/projects/${projectId}/jobs/${jobId}/application`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });

    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as ProjectSnapshot;
    expect(snapshot.jobApplications).toHaveLength(1);
    const application = snapshot.jobApplications[0];
    expect(application).toMatchObject({ jobId, status: "applied", interviewRounds: 0 });
    expect(application?.appliedAt).toBeTruthy();
  });

  test("PUT upserts status and rounds, keeping appliedAt", async () => {
    const first = await app.request(`/api/projects/${projectId}/jobs/${jobId}/application`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    const firstSnapshot = (await first.json()) as ProjectSnapshot;
    const appliedAt = firstSnapshot.jobApplications[0]?.appliedAt;

    const response = await app.request(`/api/projects/${projectId}/jobs/${jobId}/application`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "interviewing", interviewRounds: 2 }),
    });

    const snapshot = (await response.json()) as ProjectSnapshot;
    expect(snapshot.jobApplications).toHaveLength(1);
    expect(snapshot.jobApplications[0]).toMatchObject({
      jobId,
      status: "interviewing",
      interviewRounds: 2,
      appliedAt,
    });
  });

  test("PUT rejects unknown jobs", async () => {
    const response = await app.request(`/api/projects/${projectId}/jobs/missing/application`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });

    expect(response.status).toBe(404);
  });

  test("DELETE clears the tracked application", async () => {
    const response = await app.request(`/api/projects/${projectId}/jobs/${jobId}/application`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as ProjectSnapshot;
    expect(snapshot.jobApplications).toHaveLength(0);
  });
});
