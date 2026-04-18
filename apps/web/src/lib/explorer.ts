import type { ExplorerPresetId, StructuredProfile } from "@jobseeker/contracts";

export interface ExplorerPreset {
  id: ExplorerPresetId;
  label: string;
  description: string;
  market: "Australia" | "Global";
  focus: string;
  sourceFamilies: string[];
  tags: string[];
}

export interface ExplorerQuerySuggestion {
  id: string;
  label: string;
  kind: "role" | "location" | "keyword" | "combined";
}

export interface ExplorerDomainTarget {
  id: string;
  domain: string;
  queries: ExplorerQuerySuggestion[];
}

export const explorerPresets: ExplorerPreset[] = [
  {
    id: "australia-general",
    label: "Australia general",
    description: "Seek, LinkedIn, and broad AU hiring surfaces.",
    market: "Australia",
    focus: "General market coverage across mainstream AU hiring channels.",
    sourceFamilies: ["Seek", "LinkedIn", "AU general boards"],
    tags: ["generalist", "australia", "broad reach"],
  },
  {
    id: "product-engineering",
    label: "Product engineering",
    description: "Startup and product-oriented hiring networks.",
    market: "Global",
    focus: "Product-led teams, startup operators, and software product orgs.",
    sourceFamilies: ["Greenhouse", "Lever", "Startup boards"],
    tags: ["product", "engineering", "startup"],
  },
  {
    id: "ai-and-data",
    label: "AI and data",
    description: "Data, ML, and AI-specialized job boards.",
    market: "Global",
    focus: "ML, data, and AI-specific hiring surfaces and communities.",
    sourceFamilies: ["AI job boards", "ML communities", "Data specialist boards"],
    tags: ["ai", "machine learning", "data"],
  },
];

export function normalizeExplorerDomains(input: string | string[]): string[] {
  const values = Array.isArray(input) ? input : input.split(/[\n,]/g);
  const deduped = new Map<string, string>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }

  return [...deduped.values()];
}

export function getExplorerStats(presetIds: ExplorerPresetId[], domains: string[]) {
  const selectedPresets = explorerPresets.filter((preset) => presetIds.includes(preset.id));
  const uniqueSourceFamilies = new Set(selectedPresets.flatMap((preset) => preset.sourceFamilies));
  const uniqueMarkets = new Set(selectedPresets.map((preset) => preset.market));
  const uniqueTags = new Set(selectedPresets.flatMap((preset) => preset.tags));

  return {
    selectedPresetCount: selectedPresets.length,
    availablePresetCount: explorerPresets.length,
    manualDomainCount: domains.length,
    sourceFamilyCount: uniqueSourceFamilies.size,
    coverageCount: uniqueSourceFamilies.size + domains.length,
    markets: [...uniqueMarkets],
    tags: [...uniqueTags],
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

  const locations = [...profile.targeting.locations]
    .sort((left, right) => right.priority - left.priority)
    .map((location) => formatLocation(location))
    .filter(Boolean)
    .slice(0, 2);

  const keywords = profile.searchContext.effectiveKeywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 4);

  const suggestions: ExplorerQuerySuggestion[] = [];

  for (const role of roles) {
    suggestions.push({
      id: `role:${role}`,
      label: role,
      kind: "role",
    });
  }

  for (const location of locations) {
    suggestions.push({
      id: `location:${location}`,
      label: location,
      kind: "location",
    });
  }

  for (const keyword of keywords) {
    suggestions.push({
      id: `keyword:${keyword}`,
      label: keyword,
      kind: "keyword",
    });
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
  }

  return dedupeQueries(suggestions).slice(0, 8);
}

export function getExplorerDomainTargets(
  domains: string[],
  queries: ExplorerQuerySuggestion[],
): ExplorerDomainTarget[] {
  return domains.map((domain) => ({
    id: domain.toLowerCase(),
    domain,
    queries,
  }));
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

  if (location.remote === "full") {
    return parts.length > 0 ? `${parts.join(", ")} remote` : "remote";
  }

  return parts.join(", ");
}
