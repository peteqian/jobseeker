import type { ExplorerFreshness } from "./core";
import type { ProfileLocation, ProfileTargetRole, StructuredProfile } from "./profile";

export type RemotePreference = "no" | "hybrid" | "full";

export interface SearchIntentRole {
  title: string;
  priority: number;
  level: ProfileTargetRole["level"];
}

export interface SearchIntent {
  roles: SearchIntentRole[];
  locations: ProfileLocation[];
  effectiveKeywords: string[];
  ineffectiveKeywords: string[];
}

export interface NavigationContext {
  query: string;
  locationText?: string;
  remotePreference?: RemotePreference;
  freshness: ExplorerFreshness;
  maxJobs: number;
}

// Full profile is the match context. Keep as alias so ranking code depends on a
// stable name even if we ever narrow the shape later.
export type MatchContext = StructuredProfile;

const MAX_ROLES = 3;
const MAX_LOCATIONS = 2;
const MAX_EFFECTIVE_KEYWORDS = 4;

// Priority is 1-10 in the editor (default 5). Higher = more preferred.
function byPriorityDesc<T extends { priority: number }>(a: T, b: T): number {
  return b.priority - a.priority;
}

export function deriveSearchIntent(profile: StructuredProfile): SearchIntent {
  const roles = [...profile.targeting.roles]
    .sort(byPriorityDesc)
    .slice(0, MAX_ROLES)
    .map((role) => ({ title: role.title, priority: role.priority, level: role.level }));

  const locations = [...profile.targeting.locations].sort(byPriorityDesc).slice(0, MAX_LOCATIONS);

  return {
    roles,
    locations,
    effectiveKeywords: profile.searchContext.effectiveKeywords.slice(0, MAX_EFFECTIVE_KEYWORDS),
    ineffectiveKeywords: profile.searchContext.ineffectiveKeywords.slice(),
  };
}

function formatLocationText(location: ProfileLocation): string {
  return [location.city, location.state, location.country]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(", ");
}

// Picks the strongest remote signal across the top locations. "full" beats
// "hybrid" beats "no". Returns undefined when no locations exist.
function resolveRemotePreference(locations: ProfileLocation[]): RemotePreference | undefined {
  const rank: Record<RemotePreference, number> = { full: 3, hybrid: 2, no: 1 };
  let best: RemotePreference | undefined;
  let bestRank = 0;
  for (const location of locations) {
    const current = rank[location.remote];
    if (current > bestRank) {
      bestRank = current;
      best = location.remote;
    }
  }
  return best;
}

export function deriveNavigationContext(input: {
  intent: SearchIntent;
  query: string;
  freshness: ExplorerFreshness;
  maxJobs: number;
}): NavigationContext {
  const topLocation = input.intent.locations[0];
  const locationText = topLocation ? formatLocationText(topLocation) : undefined;
  const remotePreference = resolveRemotePreference(input.intent.locations);

  return {
    query: input.query,
    locationText: locationText || undefined,
    remotePreference,
    freshness: input.freshness,
    maxJobs: input.maxJobs,
  };
}
