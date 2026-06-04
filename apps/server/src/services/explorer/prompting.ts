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
    "Before applying any filter, inspect the search page first: sites expose filters differently (dropdowns, radio groups, checkboxes, chips, sidebar facets), and the same filter may live in different places on different sites. Look at the visible controls, and inspect the page HTML if a control is not visually obvious, then use what this site actually provides.",
  ];

  if (input.freshness !== "any") {
    lines.push(
      `Apply the site's date-posted filter instead of judging dates yourself (e.g. SEEK exposes a "Listing time" dropdown with Today / Last 3 days / Last 7 days / Last 14 days / Last 30 days; other sites name and shape it differently). Pick the closest option covering ${freshnessText}. Only fall back to scanning posting dates if the site has no such filter.`,
    );
  }

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
      `${arrangementHint} Do not type "remote"/"hybrid"/"on-site" into the keyword search - use the site's dedicated work-arrangement filter (often labelled On-site / Hybrid / Remote, but check what this site offers).`,
    );
  }

  lines.push(
    "Keyword search box is only for the role/title query. Location, work arrangement, and date posted belong in their dedicated inputs or filters.",
    'If a dismissable promo/sign-in popup covers the page (e.g. SEEK\'s "Sign in to find jobs matched to you"), first try to close it: click its X, click "See more", or click outside it, then keep browsing the public listings.',
    "If a sign-in/login wall blocks the listings and you cannot view jobs without an account, call report_blocked with a short reason. This PAUSES the run and asks the user to sign in in the open browser window; do NOT create an account or sign in yourself. When report_blocked returns, the user has signed in - keep browsing the now-visible listings and report jobs. Do NOT finish because of the wall.",
    "Return only currently visible, real job listings from this site.",
    "Call the report_job action for each listing as soon as its title, company, and URL are visible.",
    "When the results layout is stable, call save_trajectory once so future runs can replay it without the agent.",
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
