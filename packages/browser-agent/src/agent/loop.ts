import { executeAction } from "../actions/execute";
import { actionSchemas, type Action, type ActionName } from "../actions/types";
import type { LaunchOptions } from "../cdp/launch";
import { BrowserSession, type Page } from "../browser/session";
import { formatSnapshotForLLM, serializePage } from "../dom/serialize";
import { SYSTEM_PROMPT } from "./prompts";

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

export interface AgentOptions {
  task: string;
  decide: (input: DecisionInput) => Promise<Decision>;
  maxSteps?: number;
  launch?: LaunchOptions;
  startUrl?: string;
  page?: Page;
  session?: BrowserSession;
  onStep?: (info: StepInfo) => void;
  onFoundJobs?: (jobs: FoundJob[]) => void | Promise<void>;
  onDistilledTrajectory?: (trajectory: DistilledTrajectory) => void | Promise<void>;
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

export function buildDecisionPrompt(input: DecisionInput): string {
  const historyBlock =
    input.history.length === 0
      ? "(none)"
      : input.history.map((h, idx) => `${idx + 1}. ${h.action} => ${h.result}`).join("\n");

  return `${SYSTEM_PROMPT}

Task: ${input.task}
Step: ${input.step}/${input.maxSteps}
Active tab: ${input.activeTab}
Open tabs: ${input.tabs.join(", ")}

Recent action history:
${historyBlock}

Observation:
${input.observation}

Respond with the structured decision described in the system prompt.`;
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const maxSteps = options.maxSteps ?? 40;

  const ownsSession = !options.session && !options.page;
  const session =
    options.session ??
    (ownsSession ? await BrowserSession.launch(options.launch ?? {}) : undefined);
  let page = options.page ?? (session ? await session.newPage() : undefined);

  if (!page) {
    throw new Error("No page available — provide options.page or options.session.");
  }

  if (options.startUrl) {
    await page.goto(options.startUrl);
  }

  const actionHistory: Array<{ action: string; result: string }> = [];
  const collectedJobs: FoundJob[] = [];

  try {
    for (let step = 1; step <= maxSteps; step++) {
      await page.waitForStablePage(3_000).catch(() => {
        // continue even if stabilization timed out
      });

      const snapshot = await serializePage(page);
      const pending = await page.getPendingNetworkRequests(5).catch(() => []);
      const pendingSummary =
        pending.length === 0
          ? "PENDING REQUESTS: none"
          : `PENDING REQUESTS (${pending.length}):\n${pending
              .map(
                (req) =>
                  `- ${req.method} ${req.resourceType} ${req.loadingDurationMs}ms ${req.url}`,
              )
              .join("\n")}`;
      const observation = `${formatSnapshotForLLM(snapshot)}\n${pendingSummary}`;
      const tabs = session ? await session.listPageTargetIds() : [page.targetId];

      let decision: Decision;
      try {
        decision = await options.decide({
          task: options.task,
          step,
          maxSteps,
          observation,
          tabs,
          activeTab: page.targetId,
          history: actionHistory.slice(-8),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          summary: `Model decision failed: ${message}`,
          data: collectedJobs.length > 0 ? { jobs: collectedJobs } : null,
          steps: step,
        };
      }

      if (decision.foundJobs && decision.foundJobs.length > 0) {
        collectedJobs.push(...decision.foundJobs);
        await options.onFoundJobs?.(decision.foundJobs);
      }

      if (decision.distilledTrajectory) {
        await options.onDistilledTrajectory?.(decision.distilledTrajectory);
      }

      const actions = decision.actions ?? [];
      let terminal = false;
      let terminalResult: AgentResult | null = null;

      for (const rawAction of actions) {
        const action = parseAction(rawAction.name, rawAction.params);
        if (!action) {
          actionHistory.push({
            action: rawAction.name,
            result: "Invalid action payload",
          });
          continue;
        }

        const result = await executeAction(page, action, session);
        if (result.activeTargetId && session) {
          page = session.getPage(result.activeTargetId);
        }

        options.onStep?.({
          step,
          url: snapshot.url,
          action,
          result: { ok: result.ok, message: result.message },
        });

        actionHistory.push({
          action: `${action.name}(${JSON.stringify(action.params)})`,
          result: result.longTermMemory ?? result.message,
        });

        if (action.name === "done") {
          terminal = true;
          terminalResult = {
            success: action.params.success,
            summary: action.params.summary,
            data: { jobs: collectedJobs },
            steps: step,
          };
          break;
        }
      }

      if (terminal && terminalResult) {
        return terminalResult;
      }

      if (decision.done) {
        return {
          success: decision.success ?? true,
          summary: decision.summary ?? "Agent signaled done.",
          data: { jobs: collectedJobs },
          steps: step,
        };
      }
    }

    return {
      success: false,
      summary: `Exceeded max steps (${maxSteps}).`,
      data: { jobs: collectedJobs },
      steps: maxSteps,
    };
  } finally {
    if (ownsSession && session) {
      await session.close();
    }
  }
}

function parseAction(name: string, input: unknown): Action | null {
  if (!isActionName(name)) return null;
  const schema = actionSchemas[name];
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  return { name, params: parsed.data } as Action;
}

function isActionName(name: string): name is ActionName {
  return name in actionSchemas;
}
