#!/usr/bin/env node

import { spawn } from "node:child_process";

function resolvePort() {
  const rawUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (!rawUrl) {
    return 3457;
  }

  try {
    const url = new URL(rawUrl);
    const port = Number.parseInt(url.port, 10);
    return Number.isInteger(port) && port > 0 ? port : 3457;
  } catch {
    return 3457;
  }
}

const port = resolvePort();

const child = spawn(
  "bunx",
  ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
