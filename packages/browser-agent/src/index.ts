export { BrowserSession, Page } from "./browser/session";
export { BrowserProfile } from "./browser/profile";
export type { BrowserProfileInit } from "./browser/profile";
export { CDPClient } from "./cdp/client";
export { launchBrowser } from "./cdp/launch";
export type { LaunchOptions, LaunchedBrowser } from "./cdp/launch";

export { serializePage, formatSnapshotForLLM } from "./dom/serialize";
export type { ElementInfo, ElementBBox, PageSnapshot } from "./dom/types";

export { executeAction } from "./actions/execute";
export type { ActionResult } from "./actions/execute";
export { actionSchemas } from "./actions/types";
export type { Action, ActionName } from "./actions/types";

export { runAgent, buildDecisionPrompt } from "./agent/loop";
export { createCodexCliDecide } from "./agent/codexCliDecide";
export type {
  AgentOptions,
  AgentResult,
  Decision,
  DecisionInput,
  DistilledTrajectory,
  Extractor,
  FoundJob,
  RawAction,
  StepInfo,
  TrajectoryStep,
} from "./agent/contracts";
export { SYSTEM_PROMPT } from "./agent/prompts";

export { createServer as createMcpServer, runStdioServer } from "./mcp/server";
