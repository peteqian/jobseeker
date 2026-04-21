import type { Page } from "@jobseeker/browser-agent";

import type { FoundJob } from "./persist";
import type { DistilledTrajectory, Extractor, TrajectoryStep } from "./memory";

// Minimum fraction of listings that must have title+url populated for a replay
// result to count as a pass. Below this we treat the trajectory as drifted and
// fall back to agent discovery rather than poison results with bad rows.
const QUALITY_PASS_RATIO = 0.7;

export interface ReplayOptions {
  page: Page;
  trajectory: DistilledTrajectory;
  query: string;
  signal?: AbortSignal;
}

export interface ReplayResult {
  success: boolean;
  jobs: FoundJob[];
  reason?: string;
}

export async function replayTrajectory(options: ReplayOptions): Promise<ReplayResult> {
  try {
    for (const step of options.trajectory.actions) {
      if (options.signal?.aborted) {
        return { success: false, jobs: [], reason: "aborted" };
      }
      await executeStep(options.page, step, options.query);
    }
    const jobs = await extractJobs(options.page, options.trajectory.extractor);
    if (jobs.length === 0) {
      return { success: false, jobs, reason: "No jobs extracted" };
    }
    // Strict gate: title + url must be present on every row (already enforced
    // during extract). Soft gate: most rows should have 3+ filled fields.
    const strongEnough =
      jobs.filter((job) => countFilledFields(job) >= 3).length >= jobs.length * QUALITY_PASS_RATIO;
    if (!strongEnough) {
      return {
        success: false,
        jobs,
        reason: `Extracted jobs missing required fields (${jobs.length} rows, ${QUALITY_PASS_RATIO * 100}% threshold)`,
      };
    }
    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, jobs: [], reason: message };
  }
}

function countFilledFields(job: FoundJob): number {
  let count = 0;
  if (job.title.trim()) count += 1;
  if (job.url.trim()) count += 1;
  if (job.company.trim() && job.company !== "Unknown company") count += 1;
  if (job.location.trim() && job.location !== "Unknown location") count += 1;
  if (job.summary.trim() && job.summary !== "No summary provided.") count += 1;
  return count;
}

async function executeStep(page: Page, step: TrajectoryStep, query: string): Promise<void> {
  const interpolate = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    return value.replace(/\$\{query\}/g, query);
  };
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(step.paramsTemplate)) {
    params[key] = interpolate(value);
  }

  switch (step.name) {
    case "navigate": {
      const url = String(params.url ?? "");
      if (!url) throw new Error("navigate step missing url");
      await page.goto(url);
      return;
    }
    case "waitFor": {
      const selector = String(params.selector ?? "");
      const timeoutMs = Number(params.timeoutMs ?? 10_000);
      if (!selector) throw new Error("waitFor step missing selector");
      await waitForSelector(page, selector, timeoutMs);
      return;
    }
    case "type": {
      const selector = String(params.selector ?? "");
      const text = String(params.text ?? "");
      const submit = params.submit === true;
      if (!selector) throw new Error("type step missing selector");
      await typeIntoSelector(page, selector, text, submit);
      return;
    }
    case "click": {
      const selector = String(params.selector ?? "");
      if (!selector) throw new Error("click step missing selector");
      await clickSelector(page, selector);
      return;
    }
    case "scroll": {
      const pixels = Number(params.pixels ?? 800);
      await page.evaluate(`window.scrollBy(0, ${pixels})`);
      return;
    }
    case "wait": {
      const ms = Number(params.ms ?? 500);
      await new Promise((resolve) => setTimeout(resolve, ms));
      return;
    }
    default:
      throw new Error(`Unknown trajectory step: ${step.name}`);
  }
}

async function waitForSelector(page: Page, selector: string, timeoutMs: number): Promise<void> {
  const expr = `(async () => {
    const start = Date.now();
    while (Date.now() - start < ${timeoutMs}) {
      if (document.querySelector(${JSON.stringify(selector)})) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  })()`;
  const ok = await page.evaluate<boolean>(expr);
  if (!ok) {
    throw new Error(`waitFor selector timed out: ${selector}`);
  }
}

async function typeIntoSelector(
  page: Page,
  selector: string,
  text: string,
  submit: boolean,
): Promise<void> {
  const expr = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    if ("value" in el) {
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.textContent = ${JSON.stringify(text)};
    }
    if (${submit ? "true" : "false"}) {
      const form = el.form;
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
      else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    return true;
  })()`;
  const ok = await page.evaluate<boolean>(expr);
  if (!ok) {
    throw new Error(`type selector not found: ${selector}`);
  }
}

async function clickSelector(page: Page, selector: string): Promise<void> {
  const expr = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`;
  const ok = await page.evaluate<boolean>(expr);
  if (!ok) {
    throw new Error(`click selector not found: ${selector}`);
  }
}

async function extractJobs(page: Page, extractor: Extractor): Promise<FoundJob[]> {
  const fieldsJson = JSON.stringify(extractor.fields);
  const listingSelectorJson = JSON.stringify(extractor.listingSelector);
  const expr = `(() => {
    const fields = ${fieldsJson};
    const listingSelector = ${listingSelectorJson};
    const cards = Array.from(document.querySelectorAll(listingSelector));
    function resolve(node, field) {
      const target = node.querySelector(field.selector);
      if (!target) return "";
      if (field.attr === "href" || field.attr === "src") {
        const value = target.getAttribute(field.attr);
        if (!value) return "";
        try { return new URL(value, window.location.href).toString(); } catch { return value; }
      }
      if (field.attr) return target.getAttribute(field.attr) ?? "";
      return (target.textContent || "").trim();
    }
    return cards.map((card) => {
      const out = {};
      for (const [key, field] of Object.entries(fields)) {
        out[key] = resolve(card, field);
      }
      return out;
    });
  })()`;
  const rows = await page.evaluate<Array<Record<string, string>>>(expr);
  const out: FoundJob[] = [];
  for (const row of rows ?? []) {
    const title = row.title?.trim();
    const url = row.url?.trim();
    if (!title || !url) continue;
    out.push({
      title,
      url,
      company: row.company?.trim() || "Unknown company",
      location: row.location?.trim() || "Unknown location",
      summary: row.summary?.trim() || "No summary provided.",
      salary: row.salary?.trim() || undefined,
    });
  }
  return out;
}
