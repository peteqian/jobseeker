import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";

import { desktopDir, resolveElectronPath } from "./electron-launcher.mjs";
import { waitForResources } from "./wait-for-resources.mjs";

const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
if (!devServerUrl) {
  throw new Error("VITE_DEV_SERVER_URL is required for desktop development.");
}

const devServer = new URL(devServerUrl);
const port = Number.parseInt(devServer.port, 10);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`VITE_DEV_SERVER_URL must include an explicit port: ${devServerUrl}`);
}

await waitForResources({
  baseDir: desktopDir,
  files: ["dist-electron/main.cjs", "dist-electron/preload.cjs"],
  tcpHost: devServer.hostname,
  tcpPort: port,
});

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

let shuttingDown = false;
let restartTimer = null;
let currentApp = null;

function startApp() {
  if (shuttingDown || currentApp !== null) return;

  const app = spawn(resolveElectronPath(), ["dist-electron/main.cjs"], {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  });

  currentApp = app;

  app.once("exit", () => {
    if (currentApp === app) currentApp = null;
    if (!shuttingDown) scheduleRestart();
  });
}

function stopApp() {
  const app = currentApp;
  if (!app) return;

  currentApp = null;
  app.kill("SIGTERM");
}

function scheduleRestart() {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    stopApp();
    startApp();
  }, 120);
}

const watcher = watch(
  join(desktopDir, "dist-electron"),
  { persistent: true },
  (_eventType, filename) => {
    if (filename === "main.cjs" || filename === "preload.cjs") {
      scheduleRestart();
    }
  },
);

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  watcher.close();
  stopApp();
  process.exit(exitCode);
}

startApp();

process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));
process.once("SIGHUP", () => shutdown(129));
