import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, shell } from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const backendPort = Number.parseInt(process.env.PORT ?? "3456", 10) || 3456;

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  checkForUpdates(): Promise<unknown>;
};

const { autoUpdater } = require("electron-updater") as { autoUpdater: AutoUpdaterLike };

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let updatePollTimer: ReturnType<typeof setInterval> | null = null;

function resolveRepoRoot(): string {
  return resolve(__dirname, "../../..");
}

function resolveBackendEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "apps", "server", "dist", "bin.mjs");
  }

  return join(resolveRepoRoot(), "apps", "server", "dist", "bin.mjs");
}

function resolveWebIndexPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "apps", "web", "dist", "index.html");
  }

  return join(resolveRepoRoot(), "apps", "web", "dist", "index.html");
}

function resolveBunBin(): string {
  return process.env.JOBSEEKER_BUN_BIN?.trim() || "bun";
}

function startBackend(): void {
  if (isDevelopment || backendProcess) {
    return;
  }

  const backendEntry = resolveBackendEntry();
  if (!existsSync(backendEntry)) {
    console.warn(`[desktop] server entry missing: ${backendEntry}`);
    return;
  }

  backendProcess = spawn(resolveBunBin(), [backendEntry], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(backendPort),
      HOST: "127.0.0.1",
      CORS_ORIGIN: "*",
      DATA_DIR: join(app.getPath("userData"), "runtime"),
    },
  });

  backendProcess.once("exit", () => {
    backendProcess = null;
  });
}

function stopBackend(): void {
  if (!backendProcess) {
    return;
  }

  backendProcess.kill("SIGTERM");
  backendProcess = null;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDevelopment) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL!);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(resolveWebIndexPath());
  }

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function setupAutoUpdates(): void {
  if (isDevelopment || !app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  (autoUpdater as { allowPrerelease?: boolean }).allowPrerelease = app
    .getVersion()
    .toLowerCase()
    .includes("nightly");

  autoUpdater.on("checking-for-update", () => {
    console.info("[desktop] checking for updates");
  });

  autoUpdater.on("update-available", (info: unknown) => {
    const version =
      typeof info === "object" && info && "version" in info ? String(info.version) : "unknown";
    console.info(`[desktop] update available: ${version}`);
  });

  autoUpdater.on("update-not-available", () => {
    console.info("[desktop] update not available");
  });

  autoUpdater.on("error", (error: unknown) => {
    console.warn("[desktop] auto-update error", error);
  });

  autoUpdater.on("download-progress", (progress: unknown) => {
    const percent =
      typeof progress === "object" && progress && "percent" in progress
        ? Number(progress.percent)
        : Number.NaN;
    console.info(
      `[desktop] update download progress: ${Number.isFinite(percent) ? Math.round(percent) : "unknown"}%`,
    );
  });

  autoUpdater.on("update-downloaded", (info: unknown) => {
    const version =
      typeof info === "object" && info && "version" in info ? String(info.version) : "unknown";
    console.info(`[desktop] update downloaded: ${version}`);
  });

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.warn("[desktop] initial update check failed", error);
  });

  updatePollTimer = setInterval(
    () => {
      void autoUpdater.checkForUpdates().catch((error: unknown) => {
        console.warn("[desktop] periodic update check failed", error);
      });
    },
    30 * 60 * 1000,
  );
}

function teardownAutoUpdates(): void {
  if (!updatePollTimer) {
    return;
  }

  clearInterval(updatePollTimer);
  updatePollTimer = null;
}

void app.whenReady().then(() => {
  startBackend();
  setupAutoUpdates();
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  teardownAutoUpdates();
  stopBackend();
});
