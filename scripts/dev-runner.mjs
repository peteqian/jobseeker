#!/usr/bin/env node

import { spawn } from "node:child_process";

const MODE_ARGS = {
  dev: ["run", "dev", "--filter=web", "--filter=server"],
  "dev:server": ["run", "dev", "--filter=server"],
  "dev:web": ["run", "dev", "--filter=web"],
  "dev:desktop": ["run", "dev", "--filter=desktop", "--filter=web", "--filter=server"],
};

const mode = process.argv[2] ?? "dev";
const args = MODE_ARGS[mode];

if (!args) {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}

const serverPort = Number.parseInt(process.env.JOBSEEKER_SERVER_PORT ?? "3456", 10);
const webPort = Number.parseInt(process.env.JOBSEEKER_WEB_PORT ?? "3457", 10);
const wsPort = serverPort + 2;

const env = {
  ...process.env,
  PORT: String(serverPort),
  HOST: process.env.HOST ?? "127.0.0.1",
  VITE_SERVER_URL: process.env.VITE_SERVER_URL ?? `http://127.0.0.1:${serverPort}`,
  VITE_WS_URL: process.env.VITE_WS_URL ?? `ws://127.0.0.1:${wsPort}/ws`,
  VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL ?? `http://127.0.0.1:${webPort}`,
};

const child = spawn("bunx", ["turbo", ...args, "--ui=tui"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
