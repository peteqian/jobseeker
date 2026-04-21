#!/usr/bin/env bun
import { createCodexCliDecide, runAgent } from "../src/index";

interface CliOptions {
  task: string;
  url?: string;
  maxSteps?: number;
  headless: boolean;
  model?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  const opts: Partial<CliOptions> = { headless: true };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") {
      opts.url = argv[++i];
    } else if (arg === "--max-steps") {
      opts.maxSteps = Number.parseInt(argv[++i] ?? "0", 10);
    } else if (arg === "--no-headless") {
      opts.headless = false;
    } else if (arg === "--headless") {
      opts.headless = true;
    } else if (arg === "--model") {
      opts.model = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }

  const task = positional.join(" ").trim();
  if (!task) {
    printHelp();
    process.exit(1);
  }

  return {
    task,
    url: opts.url,
    maxSteps: opts.maxSteps,
    headless: opts.headless ?? true,
    model: opts.model,
  };
}

function printHelp() {
  console.log(`browser-agent — run a browser task with an LLM agent.

Usage:
  browser-agent "<task>" [--url <start-url>] [--max-steps N] [--no-headless] [--model gpt-5.3-codex]

Env (optional):
  CODEX_BIN  path to codex binary (default: codex)

Examples:
  browser-agent "Go to example.com and report the H1"
  browser-agent "Find top 5 frontend jobs on seek.com.au" --url https://seek.com.au --max-steps 30
`);
}

const opts = parseArgs(process.argv.slice(2));

const result = await runAgent({
  task: opts.task,
  startUrl: opts.url,
  maxSteps: opts.maxSteps,
  launch: { headless: opts.headless },
  decide: createCodexCliDecide({ model: opts.model ?? "gpt-5.3-codex" }),
  onStep: (step) => {
    const short = step.action.name === "done" ? "" : ` -> ${step.result.message}`;
    console.error(
      `[${step.step}] ${step.action.name}(${JSON.stringify(step.action.params)})${short}`,
    );
  },
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
