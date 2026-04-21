import { eq } from "drizzle-orm";
import type { ExplorerConfigRecord } from "@jobseeker/contracts";

import { db } from "../../db";
import { explorerConfigs } from "../../db/schema";
import { defaultExplorerConfig, mapExplorerConfigRow } from "../projects/explorerConfig";
import { readProjectProfile } from "../projects/profile";

export async function readExplorerConfig(projectId: string): Promise<ExplorerConfigRecord> {
  const row = await db
    .select()
    .from(explorerConfigs)
    .where(eq(explorerConfigs.projectId, projectId))
    .get();

  return row
    ? mapExplorerConfigRow(row)
    : defaultExplorerConfig(projectId, new Date().toISOString());
}

export async function readExplorerProfile(projectId: string) {
  return readProjectProfile(projectId);
}
