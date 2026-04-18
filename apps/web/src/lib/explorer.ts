import type {
  ExplorerDomainConfig,
  ExplorerFreshness,
  StructuredProfile,
} from "@jobseeker/contracts";

export interface ExplorerQuerySuggestion {
  id: string;
  label: string;
  kind: "role" | "location" | "keyword" | "combined" | "remote";
}

export const DEFAULT_JOB_LIMIT = 25;
export const DEFAULT_FRESHNESS: ExplorerFreshness = "week";

export const FRESHNESS_LABELS: Record<ExplorerFreshness, string> = {
  "24h": "Last 24 hours",
  week: "Last week",
  month: "Last month",
  any: "Any time",
};

export function createDomainConfig(domain: string): ExplorerDomainConfig {
  return {
    domain: domain.trim(),
    enabled: true,
    jobLimit: DEFAULT_JOB_LIMIT,
    freshness: DEFAULT_FRESHNESS,
    queries: [],
  };
}

export function addQueryToDomain(
  config: ExplorerDomainConfig,
  query: string,
): ExplorerDomainConfig {
  const trimmed = query.trim();
  if (!trimmed) return config;

  const key = trimmed.toLowerCase();
  if (config.queries.some((entry) => entry.toLowerCase() === key)) {
    return config;
  }

  return { ...config, queries: [...config.queries, trimmed] };
}

export function removeQueryFromDomain(
  config: ExplorerDomainConfig,
  query: string,
): ExplorerDomainConfig {
  const key = query.toLowerCase();
  return {
    ...config,
    queries: config.queries.filter((entry) => entry.toLowerCase() !== key),
  };
}

export function parseDomainLines(input: string): string[] {
  const tokens = input.split(/[\n,]/g);
  const seen = new Map<string, string>();

  for (const token of tokens) {
    const value = token.trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, value);
    }
  }

  return [...seen.values()];
}

export function mergeDomainConfigs(
  existing: ExplorerDomainConfig[],
  domains: string[],
): ExplorerDomainConfig[] {
  const byKey = new Map(existing.map((entry) => [entry.domain.toLowerCase(), entry]));

  return domains.map((domain) => byKey.get(domain.toLowerCase()) ?? createDomainConfig(domain));
}

export function upsertDomainConfig(
  list: ExplorerDomainConfig[],
  next: ExplorerDomainConfig,
): ExplorerDomainConfig[] {
  const key = next.domain.toLowerCase();
  const index = list.findIndex((entry) => entry.domain.toLowerCase() === key);

  if (index === -1) {
    return [...list, next];
  }

  const copy = list.slice();
  copy[index] = next;
  return copy;
}

export function removeDomainConfig(
  list: ExplorerDomainConfig[],
  domain: string,
): ExplorerDomainConfig[] {
  const key = domain.toLowerCase();
  return list.filter((entry) => entry.domain.toLowerCase() !== key);
}

export function getExplorerStats(domains: ExplorerDomainConfig[]) {
  const enabled = domains.filter((entry) => entry.enabled);
  const totalCap = enabled.reduce((sum, entry) => sum + entry.jobLimit, 0);

  return {
    domainCount: domains.length,
    enabledCount: enabled.length,
    totalJobCap: totalCap,
  };
}

export function getExplorerQuerySuggestions(
  profile: StructuredProfile | null,
): ExplorerQuerySuggestion[] {
  if (!profile) {
    return [];
  }

  const roles = [...profile.targeting.roles]
    .sort((left, right) => right.priority - left.priority)
    .map((role) => role.title.trim())
    .filter(Boolean)
    .slice(0, 3);

  const sortedLocations = [...profile.targeting.locations].sort(
    (left, right) => right.priority - left.priority,
  );

  const locations = sortedLocations
    .map((location) => formatLocation(location))
    .filter(Boolean)
    .slice(0, 2);

  const remoteTerms = getRemoteTerms(sortedLocations).slice(0, 2);

  const keywords = profile.searchContext.effectiveKeywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 4);

  const suggestions: ExplorerQuerySuggestion[] = [];

  for (const role of roles) {
    suggestions.push({ id: `role:${role}`, label: role, kind: "role" });
  }

  for (const location of locations) {
    suggestions.push({ id: `location:${location}`, label: location, kind: "location" });
  }

  for (const term of remoteTerms) {
    suggestions.push({ id: `remote:${term}`, label: term, kind: "remote" });
  }

  for (const keyword of keywords) {
    suggestions.push({ id: `keyword:${keyword}`, label: keyword, kind: "keyword" });
  }

  for (const role of roles.slice(0, 2)) {
    for (const location of locations.slice(0, 1)) {
      suggestions.push({
        id: `combined:${role}:${location}`,
        label: `${role} ${location}`,
        kind: "combined",
      });
    }

    for (const keyword of keywords.slice(0, 2)) {
      suggestions.push({
        id: `combined:${role}:${keyword}`,
        label: `${role} ${keyword}`,
        kind: "combined",
      });
    }

    for (const term of remoteTerms.slice(0, 1)) {
      suggestions.push({
        id: `combined:${role}:${term}`,
        label: `${role} ${term}`,
        kind: "combined",
      });
    }
  }

  return dedupeQueries(suggestions).slice(0, 8);
}

function dedupeQueries(queries: ExplorerQuerySuggestion[]) {
  const seen = new Set<string>();

  return queries.filter((query) => {
    const key = query.label.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatLocation(location: StructuredProfile["targeting"]["locations"][number]) {
  const parts = [location.city, location.state, location.country].filter(Boolean);

  if (parts.length === 0) return "";
  return parts.join(", ");
}

function getRemoteTerms(
  locations: StructuredProfile["targeting"]["locations"],
): ExplorerQuerySuggestion["label"][] {
  let hasRemote = false;
  let hasHybrid = false;

  for (const location of locations) {
    if (location.remote === "full") {
      hasRemote = true;
      continue;
    }

    if (location.remote === "hybrid") {
      hasHybrid = true;
    }
  }

  const terms: string[] = [];
  if (hasRemote) terms.push("remote");
  if (hasHybrid) terms.push("hybrid");
  return terms;
}
