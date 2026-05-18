import type { ExplorerConfigRecord } from "@jobseeker/contracts";

import type { explorerConfigs } from "../../db/schema";

export function normalizeExplorerDomainConfigs(input: unknown): ExplorerConfigRecord["domains"] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          domain: entry,
          enabled: true,
          jobLimit: 25,
          freshness: "week" as const,
          queries: [],
        };
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const domain = typeof record.domain === "string" ? record.domain : null;
        if (!domain) return null;

        const queriesSource = Array.isArray(record.queries)
          ? record.queries
          : Array.isArray(record.queryIds)
            ? record.queryIds
            : [];

        return {
          domain,
          enabled: record.enabled !== false,
          jobLimit: typeof record.jobLimit === "number" ? record.jobLimit : 25,
          freshness:
            record.freshness === "24h" ||
            record.freshness === "week" ||
            record.freshness === "month" ||
            record.freshness === "any"
              ? record.freshness
              : "week",
          queries: queriesSource.filter((value): value is string => typeof value === "string"),
        };
      }

      return null;
    })
    .filter((entry): entry is ExplorerConfigRecord["domains"][number] => entry !== null);
}

export function mapExplorerConfigRow(
  row: typeof explorerConfigs.$inferSelect,
): ExplorerConfigRecord {
  return {
    projectId: row.projectId,
    domains: normalizeExplorerDomainConfigs(JSON.parse(row.domainsJson)),
    includeAgentSuggestions: row.includeAgentSuggestions,
    updatedAt: row.updatedAt,
  };
}

export function defaultExplorerConfig(projectId: string, updatedAt: string): ExplorerConfigRecord {
  return {
    projectId,
    domains: [],
    includeAgentSuggestions: true,
    updatedAt,
  };
}
