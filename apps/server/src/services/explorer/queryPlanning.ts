import type { ExplorerDomainConfig, ExplorerSearchConfig } from "@jobseeker/contracts";

export type QuerySource = "search_role";

export interface PlannedQuery {
  query: string;
  source: QuerySource;
}

const MAX_QUERIES_PER_DOMAIN = 8;

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

/** Returns only domains that are currently enabled in explorer config. */
export function getEnabledDomains(domains: ExplorerDomainConfig[]): ExplorerDomainConfig[] {
  return domains.filter((domain) => domain.enabled);
}

/**
 * Filters out search terms that are too vague to be useful in a site's keyword
 * field, such as bare locations or work-arrangement tokens.
 */
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

/**
 * The concrete keyword queries to run on each enabled domain: the shared run
 * roles, one query per role. Location and work-arrangement are NOT folded into
 * the keyword here — they belong in the site's dedicated inputs and are carried
 * separately on `NavigationContext`. Low-signal entries (bare locations,
 * arrangement words) are dropped and duplicates collapsed.
 */
export function getSearchQueries(search: ExplorerSearchConfig): PlannedQuery[] {
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];

  for (const role of search.roles) {
    const value = role.trim();
    if (!value || isLowSignalQuery(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ query: value, source: "search_role" });
    if (out.length >= MAX_QUERIES_PER_DOMAIN) break;
  }

  return out;
}
