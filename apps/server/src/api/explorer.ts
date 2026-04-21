import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { UpdateExplorerConfigInput } from "@jobseeker/contracts";

import { db } from "../db";
import { explorerConfigs } from "../db/schema";
import { mapExplorerConfigRow } from "../services/projects/explorerConfig";

const now = () => new Date().toISOString();

export function registerExplorerRoutes(app: Hono) {
  app.get("/api/projects/:projectId/explorer", async (c) => {
    const projectId = c.req.param("projectId");
    const config = await db
      .select()
      .from(explorerConfigs)
      .where(eq(explorerConfigs.projectId, projectId))
      .get();

    if (!config) {
      return c.json({ error: "Explorer config not found." }, 404);
    }

    return c.json({
      explorer: mapExplorerConfigRow(config),
    });
  });

  app.put("/api/projects/:projectId/explorer", async (c) => {
    const projectId = c.req.param("projectId");
    const input = (await c.req.json()) as UpdateExplorerConfigInput;
    const timestamp = now();

    await db
      .insert(explorerConfigs)
      .values({
        projectId,
        domainsJson: JSON.stringify(input.domains),
        includeAgentSuggestions: input.includeAgentSuggestions,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: explorerConfigs.projectId,
        set: {
          domainsJson: JSON.stringify(input.domains),
          includeAgentSuggestions: input.includeAgentSuggestions,
          updatedAt: timestamp,
        },
      })
      .run();

    return c.json({
      explorer: {
        projectId,
        domains: input.domains,
        includeAgentSuggestions: input.includeAgentSuggestions,
        updatedAt: timestamp,
      },
    });
  });
}
