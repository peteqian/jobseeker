import type { Action } from "../actions/types";
import type { LaunchOptions } from "../cdp/launch";
import type { BrowserSession, Page } from "../browser/session";

export interface FoundJob {
  title: string;
  company: string;
  location: string;
  url: string;
  summary: string;
  salary?: string;
}

export interface TrajectoryStep {
  name: string;
  paramsTemplate: Record<string, unknown>;
}

export interface Extractor {
  listingSelector: string;
  fields: Record<string, { selector: string; attr?: string }>;
}

export interface DistilledTrajectory {
  actions: TrajectoryStep[];
  extractor: Extractor;
}

export interface DecisionInput {
  task: string;
  step: number;
  maxSteps: number;
  observation: string;
  tabs: string[];
  activeTab: string;
  history: Array<{ action: string; result: string }>;
}

export interface RawAction {
  name: string;
  params: unknown;
}

export interface Decision {
  thought?: string;
  actions: RawAction[];
  foundJobs?: FoundJob[];
  distilledTrajectory?: DistilledTrajectory;
  done: boolean;
  summary?: string;
  success?: boolean;
}

export interface StepInfo {
  step: number;
  url: string;
  action: Action;
  result: { ok: boolean; message: string };
}

export interface AgentResult {
  success: boolean;
  summary: string;
  data: unknown;
  steps: number;
}

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
