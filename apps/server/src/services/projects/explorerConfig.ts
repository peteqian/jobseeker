import type {
  ExplorerConfigRecord,
  ExplorerFreshness,
  ExplorerSearchConfig,
} from "@jobseeker/contracts";

import type { explorerConfigs } from "../../db/schema";

const DEFAULT_FRESHNESS: ExplorerFreshness = "week";
const DEFAULT_JOB_LIMIT = 25;

function coerceFreshness(value: unknown): ExplorerFreshness {
  return value === "24h" || value === "week" || value === "month" || value === "any"
    ? value
    : DEFAULT_FRESHNESS;
}

function coerceRunMode(value: unknown): ExplorerSearchConfig["runMode"] {
  return value === "parallel" ? "parallel" : "sequential";
}

export function normalizeExplorerDomainConfigs(input: unknown): ExplorerConfigRecord["domains"] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (typeof entry === "string") {
        return { domain: entry, enabled: true };
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const domain = typeof record.domain === "string" ? record.domain : null;
        if (!domain) return null;
        return { domain, enabled: record.enabled !== false };
      }

      return null;
    })
    .filter((entry): entry is ExplorerConfigRecord["domains"][number] => entry !== null);
}

export function defaultExplorerSearchConfig(): ExplorerSearchConfig {
  return {
    roles: [],
    freshness: DEFAULT_FRESHNESS,
    jobLimit: DEFAULT_JOB_LIMIT,
    runMode: "sequential",
  };
}

/**
 * Resolves the shared search set for a config row. Prefers the new `searchJson`
 * column; when absent (a row written before the shared-search model), falls
 * back to the strongest signal still on disk: any per-domain freshness/jobLimit
 * and explicit queries carried on the legacy `domainsJson`. Roles default to
 * empty so the user fills them in once on the Configure screen.
 */
function resolveSearchConfig(row: typeof explorerConfigs.$inferSelect): ExplorerSearchConfig {
  if (row.searchJson) {
    const parsed = JSON.parse(row.searchJson) as Partial<ExplorerSearchConfig>;
    return {
      roles: Array.isArray(parsed.roles)
        ? parsed.roles.filter((r): r is string => typeof r === "string")
        : [],
      locationText: typeof parsed.locationText === "string" ? parsed.locationText : undefined,
      remotePreference:
        parsed.remotePreference === "no" ||
        parsed.remotePreference === "hybrid" ||
        parsed.remotePreference === "full"
          ? parsed.remotePreference
          : undefined,
      freshness: coerceFreshness(parsed.freshness),
      jobLimit: typeof parsed.jobLimit === "number" ? parsed.jobLimit : DEFAULT_JOB_LIMIT,
      runMode: coerceRunMode(parsed.runMode),
    };
  }

  const legacy = JSON.parse(row.domainsJson);
  const firstObj = Array.isArray(legacy)
    ? (legacy.find((e) => e && typeof e === "object") as Record<string, unknown> | undefined)
    : undefined;
  const roles = Array.isArray(legacy)
    ? [
        ...new Set(
          legacy
            .flatMap((e) =>
              e && typeof e === "object" && Array.isArray((e as Record<string, unknown>).queries)
                ? ((e as Record<string, unknown>).queries as unknown[])
                : [],
            )
            .filter((q): q is string => typeof q === "string"),
        ),
      ]
    : [];

  return {
    roles,
    freshness: coerceFreshness(firstObj?.freshness),
    jobLimit: typeof firstObj?.jobLimit === "number" ? firstObj.jobLimit : DEFAULT_JOB_LIMIT,
    runMode: "sequential",
  };
}

export function mapExplorerConfigRow(
  row: typeof explorerConfigs.$inferSelect,
): ExplorerConfigRecord {
  return {
    projectId: row.projectId,
    domains: normalizeExplorerDomainConfigs(JSON.parse(row.domainsJson)),
    search: resolveSearchConfig(row),
    includeAgentSuggestions: row.includeAgentSuggestions,
    updatedAt: row.updatedAt,
  };
}

export function defaultExplorerConfig(projectId: string, updatedAt: string): ExplorerConfigRecord {
  return {
    projectId,
    domains: [],
    search: defaultExplorerSearchConfig(),
    includeAgentSuggestions: true,
    updatedAt,
  };
}
