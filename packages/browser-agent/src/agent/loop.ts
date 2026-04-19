import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { executeAction } from "../actions/execute";
import { actionSchemas, type Action, type ActionName } from "../actions/types";
import type { LaunchOptions } from "../cdp/launch";
import { BrowserSession, type Page } from "../browser/session";
import { formatSnapshotForLLM, serializePage } from "../dom/serialize";
import { SYSTEM_PROMPT } from "./prompts";

interface CodexRequest {
  binaryPath?: string;
  model: string;
  prompt: string;
  effort?: string;
  cwd?: string;
  codexHome?: string;
  codexAuthHome?: string;
}

interface CodexDecision {
  name: string;
  params: unknown;
}

export interface AgentOptions {
  task: string;
  codexBin?: string;
  model?: string;
  effort?: string;
  maxSteps?: number;
  launch?: LaunchOptions;
  startUrl?: string;
  page?: Page;
  session?: BrowserSession;
  onStep?: (info: StepInfo) => void;
  onCodexOutput?: (info: CodexOutputInfo) => void;
  codexCwd?: string;
  codexHome?: string;
  codexAuthHome?: string;
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

export interface CodexOutputInfo {
  step: number;
  raw: string;
}

const TOOL_DESCRIPTIONS: Array<{
  name: string;
  description: string;
  input: Record<string, unknown>;
}> = [
  {
    name: "navigate",
    description: "Navigate to absolute URL, optionally in a new tab",
    input: { url: "string", newTab: "boolean?" },
  },
  {
    name: "click",
    description: "Click interactive element by [index] or viewport coordinates",
    input: { index: "integer?", coordinateX: "integer?", coordinateY: "integer?" },
  },
  {
    name: "type",
    description: "Type into element by [index], optional submit",
    input: { index: "integer", text: "string", submit: "boolean?" },
  },
  {
    name: "scroll",
    description: "Scroll page up/down/top/bottom by viewport pages",
    input: {
      direction: "up|down|top|bottom",
      pages: "number?",
      amount: "integer?",
      index: "integer?",
    },
  },
  {
    name: "wait",
    description: "Wait for milliseconds (max 10000)",
    input: { ms: "integer" },
  },
  {
    name: "send_keys",
    description: "Send keyboard key(s), supports combos like Control+K",
    input: { keys: "string" },
  },
  {
    name: "select_option",
    description: "Select option on select element by [index]",
    input: { index: "integer", value: "string" },
  },
  {
    name: "upload_file",
    description: "Upload file paths to file input by [index]",
    input: { index: "integer", paths: "string[]" },
  },
  {
    name: "wait_for_text",
    description: "Wait until text appears on page",
    input: { text: "string", timeoutMs: "integer?" },
  },
  {
    name: "go_back",
    description: "Navigate back in page history",
    input: {},
  },
  {
    name: "go_forward",
    description: "Navigate forward in page history",
    input: {},
  },
  {
    name: "refresh",
    description: "Refresh current page",
    input: {},
  },
  {
    name: "new_tab",
    description: "Open a new tab and optionally navigate",
    input: { url: "string?" },
  },
  {
    name: "switch_tab",
    description: "Switch active tab by targetId or pageId",
    input: { targetId: "string?", pageId: "integer?" },
  },
  {
    name: "close_tab",
    description: "Close tab by targetId, by pageId, or active tab when omitted",
    input: { targetId: "string?", pageId: "integer?" },
  },
  {
    name: "search_page",
    description: "Search page text quickly with pattern or regex",
    input: {
      pattern: "string",
      regex: "boolean?",
      caseSensitive: "boolean?",
      contextChars: "integer?",
      cssScope: "string?",
      maxResults: "integer?",
    },
  },
  {
    name: "find_elements",
    description: "Find elements by CSS selector",
    input: {
      selector: "string",
      attributes: "string[]?",
      maxResults: "integer?",
      includeText: "boolean?",
    },
  },
  {
    name: "get_dropdown_options",
    description: "Get options from dropdown by [index]",
    input: { index: "integer" },
  },
  {
    name: "find_text",
    description: "Scroll to first visible occurrence of text",
    input: { text: "string" },
  },
  {
    name: "screenshot",
    description: "Capture screenshot; optional fileName saves to disk",
    input: { fileName: "string?" },
  },
  {
    name: "save_as_pdf",
    description: "Save current page as PDF",
    input: {
      fileName: "string?",
      printBackground: "boolean?",
      landscape: "boolean?",
      scale: "number?",
      paperFormat: "Letter|Legal|A4|A3|Tabloid?",
    },
  },
  {
    name: "extract_content",
    description: "Extract page content chunk for a query with optional links/images",
    input: {
      query: "string",
      extractLinks: "boolean?",
      extractImages: "boolean?",
      startFromChar: "integer?",
      maxChars: "integer?",
    },
  },
  {
    name: "done",
    description: "Finish task",
    input: { success: "boolean", summary: "string", data: "unknown?" },
  },
];

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}

function extractFirstJsonObject(text: string): string | null {
  const source = cleanJsonResponse(text);
  const start = source.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function containsUsageLimitError(text: string): boolean {
  return text.toLowerCase().includes("usage limit");
}

function ensureCodexAuthInHome(codexHome: string, sourceHome?: string): void {
  mkdirSync(codexHome, { recursive: true });
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return;
  }

  const normalizedSourceHome = sourceHome?.trim();

  const candidates: Array<{ src: string; dest: string }> = [
    ...(normalizedSourceHome
      ? [
          {
            src: path.join(normalizedSourceHome, "auth.json"),
            dest: path.join(codexHome, "auth.json"),
          },
          {
            src: path.join(normalizedSourceHome, "config.toml"),
            dest: path.join(codexHome, "config.toml"),
          },
        ]
      : []),
    { src: path.join(homeDir, ".codex", "auth.json"), dest: path.join(codexHome, "auth.json") },
    {
      src: path.join(homeDir, ".codex", "config.toml"),
      dest: path.join(codexHome, "config.toml"),
    },
    {
      src: path.join(homeDir, ".config", "codex", "auth.json"),
      dest: path.join(codexHome, "auth.json"),
    },
    {
      src: path.join(homeDir, ".config", "codex", "config.toml"),
      dest: path.join(codexHome, "config.toml"),
    },
  ];

  for (const { src, dest } of candidates) {
    if (!existsSync(src) || existsSync(dest)) {
      continue;
    }
    copyFileSync(src, dest);
  }
}

async function callCodex(request: CodexRequest): Promise<string> {
  const binPath = request.binaryPath?.trim() || process.env.CODEX_BIN || "codex";
  const args = [
    binPath,
    "exec",
    "--ephemeral",
    "-s",
    "read-only",
    "--skip-git-repo-check",
    "--model",
    request.model,
  ];
  if (request.effort) {
    args.push("--config", `model_reasoning_effort="${request.effort}"`);
  }
  args.push("-");

  if (request.codexHome) {
    ensureCodexAuthInHome(request.codexHome, request.codexAuthHome);
  }

  const proc = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    ...(request.cwd ? { cwd: request.cwd } : {}),
    ...(request.codexHome ? { env: { ...process.env, CODEX_HOME: request.codexHome } } : {}),
  });

  proc.stdin.write(new TextEncoder().encode(request.prompt));
  proc.stdin.end();

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const timeoutMs = 120_000;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill();
      reject(new Error(`Codex timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const stdout = await Promise.race([stdoutPromise, timeoutPromise]);
  const exitCode = await proc.exited;
  const stderr = await stderrPromise;
  if (exitCode !== 0) {
    throw new Error(`Codex exited with code ${exitCode}: ${stderr}`);
  }
  return stdout;
}

function parseDecision(text: string): CodexDecision {
  const cleaned = cleanJsonResponse(text);
  let parsed: { name?: string; params?: unknown } | null = null;

  try {
    parsed = JSON.parse(cleaned) as { name?: string; params?: unknown };
  } catch {
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) {
      parsed = JSON.parse(extracted) as { name?: string; params?: unknown };
    }
  }

  if (!parsed) {
    if (containsUsageLimitError(cleaned)) {
      throw new Error("Model usage limit reached before a valid JSON action was returned");
    }
    throw new Error("Model response was not valid JSON");
  }

  if (!parsed.name || typeof parsed.name !== "string") {
    throw new Error("Model response missing action name");
  }
  return { name: parsed.name, params: parsed.params ?? {} };
}

function buildDecisionPrompt(input: {
  task: string;
  step: number;
  observation: string;
  tabs: string[];
  activeTab: string;
  history: Array<{ action: string; result: string }>;
}): string {
  const historyBlock =
    input.history.length === 0
      ? "(none)"
      : input.history.map((h, idx) => `${idx + 1}. ${h.action} => ${h.result}`).join("\n");

  return `${SYSTEM_PROMPT}

Task: ${input.task}
Step: ${input.step}
Active tab: ${input.activeTab}
Open tabs: ${input.tabs.join(", ")}

Recent action history:
${historyBlock}

Observation:
${input.observation}

Available actions (JSON schema style):
${JSON.stringify(TOOL_DESCRIPTIONS, null, 2)}

Return exactly one JSON object (no markdown) with this shape:
{"name":"<action_name>","params":{...}}

Do not return any text outside JSON.`;
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const model = options.model ?? "gpt-5.3-codex";
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

      const prompt = buildDecisionPrompt({
        task: options.task,
        step,
        observation,
        tabs,
        activeTab: page.targetId,
        history: actionHistory.slice(-8),
      });

      let decision: CodexDecision;
      try {
        const raw = await callCodex({
          binaryPath: options.codexBin,
          model,
          prompt,
          effort: options.effort,
          cwd: options.codexCwd,
          codexHome: options.codexHome,
          codexAuthHome: options.codexAuthHome,
        });
        options.onCodexOutput?.({
          step,
          raw,
        });

        if (containsUsageLimitError(raw)) {
          return {
            success: false,
            summary: "Model usage limit reached. Ending run early.",
            data: null,
            steps: step,
          };
        }

        decision = parseDecision(raw);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          summary: `Model decision failed: ${message}`,
          data: null,
          steps: step,
        };
      }

      const action = parseAction(decision.name, decision.params);
      if (!action) {
        actionHistory.push({
          action: decision.name,
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
        return {
          success: action.params.success,
          summary: action.params.summary,
          data: action.params.data ?? null,
          steps: step,
        };
      }
    }

    return {
      success: false,
      summary: `Exceeded max steps (${maxSteps}).`,
      data: null,
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
