import type { Action } from "../actions/types";
import type { LaunchOptions } from "../cdp/launch";
import type { BrowserSession, Page } from "../browser/session";

/**
 * Public contract types shared with browser-agent consumers.
 *
 * Downstream packages should import these shapes from `@jobseeker/browser-agent`
 * instead of redefining them locally so the package boundary can move without
 * breaking the integration contract.
 */

/** A normalized job listing extracted by the agent or by replayed selectors. */
export interface FoundJob {
  title: string;
  company: string;
  location: string;
  url: string;
  summary: string;
  salary?: string;
}

/** One replayable browser step, with `${query}` placeholders when needed. */
export interface TrajectoryStep {
  name: string;
  paramsTemplate: Record<string, unknown>;
}

/** Selector-based recipe for extracting visible job listings from a page. */
export interface Extractor {
  listingSelector: string;
  fields: Record<string, { selector: string; attr?: string }>;
}

/** Minimal replay plan emitted once the agent reaches a stable results layout. */
export interface DistilledTrajectory {
  actions: TrajectoryStep[];
  extractor: Extractor;
}

/** Snapshot of what the deciding model sees for one loop iteration. */
export interface DecisionInput {
  task: string;
  step: number;
  maxSteps: number;
  observation: string;
  tabs: string[];
  activeTab: string;
  history: Array<{ action: string; result: string }>;
}

/** Raw model-proposed action before schema parsing and execution. */
export interface RawAction {
  name: string;
  params: unknown;
}

/** Structured model output consumed by `runAgent`. */
export interface Decision {
  thought?: string;
  actions: RawAction[];
  foundJobs?: FoundJob[];
  distilledTrajectory?: DistilledTrajectory;
  done: boolean;
  summary?: string;
  success?: boolean;
}

/** Durable execution record for one action step. */
export interface StepInfo {
  step: number;
  url: string;
  action: Action;
  result: { ok: boolean; message: string };
}

/** Terminal summary returned by the browser-agent loop. */
export interface AgentResult {
  success: boolean;
  summary: string;
  data: unknown;
  steps: number;
}

/**
 * Input contract for running the browser-agent loop against either owned or
 * caller-supplied browser/page handles.
 */
export interface AgentOptions {
  task: string;
  decide: (input: DecisionInput) => Promise<Decision>;
  maxSteps?: number;
  signal?: AbortSignal;
  launch?: LaunchOptions;
  startUrl?: string;
  page?: Page;
  session?: BrowserSession;
  onStep?: (info: StepInfo) => void;
  onFoundJobs?: (jobs: FoundJob[]) => void | Promise<void>;
  onDistilledTrajectory?: (trajectory: DistilledTrajectory) => void | Promise<void>;
}
