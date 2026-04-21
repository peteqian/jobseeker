import { deriveSearchIntent } from "@jobseeker/contracts";
import type { ExplorerDomainConfig, StructuredProfile } from "@jobseeker/contracts";

export type QuerySource =
  | "domain_explicit"
  | "profile_role"
  | "profile_role_location"
  | "profile_keyword";

export interface PlannedQuery {
  query: string;
  source: QuerySource;
}

const MAX_QUERIES_PER_DOMAIN = 8;
const MAX_KEYWORD_QUERIES = 2;

const ARRANGEMENT_TOKENS = new Set(["remote", "hybrid", "on-site", "onsite", "in-office"]);
const LOCATION_HINT_TOKENS = new Set([
  "australia",
  "usa",
  "united states",
  "uk",
  "united kingdom",
  "canada",
  "nsw",
  "vic",
  "qld",
  "wa",
  "sa",
  "tas",
  "act",
  "nt",
]);

export function getRunnableDomains(domains: ExplorerDomainConfig[]): ExplorerDomainConfig[] {
  return domains.filter((domain) => domain.enabled);
}

function isLowSignalQuery(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  if (!value) return true;
  if (ARRANGEMENT_TOKENS.has(value)) return true;

  const tokens = value
    .split(/[,\s/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const allLocation = tokens.every(
    (t) => LOCATION_HINT_TOKENS.has(t) || /^\d{4,5}$/.test(t) || t.length <= 3,
  );
  return allLocation;
}

export function getQueriesForDomain(
  domain: ExplorerDomainConfig,
  profile: StructuredProfile | null,
): PlannedQuery[] {
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];

  const push = (raw: string, source: QuerySource): boolean => {
    const value = raw.trim();
    if (!value) return false;
    if (isLowSignalQuery(value)) return false;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({ query: value, source });
    return out.length >= MAX_QUERIES_PER_DOMAIN;
  };

  for (const query of domain.queries) {
    if (push(query, "domain_explicit")) break;
  }

  if (out.length > 0) {
    return out;
  }

  if (!profile) {
    return [];
  }

  const intent = deriveSearchIntent(profile);
  const topLocation = intent.locations[0];
  const wantsRemoteOnly = intent.locations.length > 0 && intent.locations[0].remote === "full";

  for (const role of intent.roles) {
    const shouldAppendLocation = topLocation && !wantsRemoteOnly && topLocation.city.trim();
    if (shouldAppendLocation) {
      if (push(`${role.title} ${topLocation.city}`, "profile_role_location")) break;
    } else if (push(role.title, "profile_role")) {
      break;
    }
  }

  if (out.length < MAX_QUERIES_PER_DOMAIN) {
    for (const keyword of intent.effectiveKeywords.slice(0, MAX_KEYWORD_QUERIES)) {
      if (push(keyword, "profile_keyword")) break;
    }
  }

  return out;
}
