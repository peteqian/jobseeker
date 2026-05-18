import type { ExplorerFreshness, NavigationContext } from "@jobseeker/contracts";

export function summarizeStepParams(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }

  const record = params as Record<string, unknown>;
  const copy: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      copy[key] = value.length > 160 ? `${value.slice(0, 160)}...` : value;
      continue;
    }

    if (Array.isArray(value)) {
      copy[key] = value.slice(0, 5);
      continue;
    }

    copy[key] = value;
  }

  return copy;
}

export function clipRawCodexOutput(raw: string): string {
  const maxChars = Number.parseInt(process.env.EXPLORER_RAW_LOG_MAX_CHARS ?? "12000", 10) || 12000;
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, maxChars)}\n... [truncated ${raw.length - maxChars} chars]`;
}

export function clipPromptForLog(prompt: string): string {
  const maxChars = Number.parseInt(process.env.EXPLORER_PROMPT_LOG_MAX_CHARS ?? "4000", 10) || 4000;
  if (prompt.length <= maxChars) {
    return prompt;
  }
  return `${prompt.slice(0, maxChars)}\n... [truncated ${prompt.length - maxChars} chars]`;
}

export function buildAgentTask(input: {
  domain: string;
  freshness: ExplorerFreshness;
  maxJobs: number;
  navigation: NavigationContext;
}): string {
  const freshnessText = freshnessToText(input.freshness);
  const lines = [
    `Find up to ${input.maxJobs} job postings on ${input.domain} for "${input.navigation.query}".`,
    `Prefer listings posted ${freshnessText}.`,
  ];

  if (input.navigation.locationText) {
    lines.push(
      `Target location: ${input.navigation.locationText}. Job sites usually have a separate "Where" / location input next to the keyword search - put the location there, not in the keyword field. If a location input is not obvious, look for a location filter or facet in the sidebar.`,
    );
  }

  if (input.navigation.remotePreference) {
    const arrangementHint =
      input.navigation.remotePreference === "full"
        ? "Only include fully remote roles."
        : input.navigation.remotePreference === "hybrid"
          ? "Prefer hybrid roles."
          : "Prefer on-site roles.";
    lines.push(
      `${arrangementHint} Do not type "remote"/"hybrid"/"on-site" into the keyword search - use the site's dedicated work-arrangement filter (usually radio buttons or checkboxes labelled On-site / Hybrid / Remote in the refine/filter panel).`,
    );
  }

  lines.push(
    "Keyword search box is only for the role/title query. Location and work arrangement belong in their dedicated inputs or filters.",
    "Return only currently visible, real job listings from this site.",
    "Emit each job via foundJobs as soon as you can see its title, company, and URL.",
    "Set done=true with success=true when you have enough listings, or success=false with a summary if blocked.",
  );
  return lines.join("\n");
}

export function toDomainUrl(domain: string): string {
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "");
  return `https://${clean}`;
}

function freshnessToText(freshness: ExplorerFreshness): string {
  if (freshness === "24h") return "within the last 24 hours";
  if (freshness === "week") return "within the last week";
  if (freshness === "month") return "within the last month";
  return "at any time";
}
