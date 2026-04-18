let node_child_process = require("node:child_process");
let node_fs = require("node:fs");
let node_path = require("node:path");
let node_url = require("node:url");
let electron = require("electron");

//#region src/main.ts
const __dirname$1 = (0, node_path.dirname)((0, node_url.fileURLToPath)(require("url").pathToFileURL(__filename).href));
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const backendPort = Number.parseInt(process.env.PORT ?? "3456", 10) || 3456;
let mainWindow = null;
let backendProcess = null;
function resolveRepoRoot() {
	return (0, node_path.resolve)(__dirname$1, "../../..");
}
function resolveBackendEntry() {
	if (electron.app.isPackaged) return (0, node_path.join)(process.resourcesPath, "apps", "server", "dist", "bin.mjs");
	return (0, node_path.join)(resolveRepoRoot(), "apps", "server", "dist", "bin.mjs");
}
function resolveWebIndexPath() {
	if (electron.app.isPackaged) return (0, node_path.join)(process.resourcesPath, "apps", "web", "dist", "index.html");
	return (0, node_path.join)(resolveRepoRoot(), "apps", "web", "dist", "index.html");
}
function resolveBunBin() {
	return process.env.JOBSEEKER_BUN_BIN?.trim() || "bun";
}
function startBackend() {
	if (isDevelopment || backendProcess) return;
	const backendEntry = resolveBackendEntry();
	if (!(0, node_fs.existsSync)(backendEntry)) {
		console.warn(`[desktop] server entry missing: ${backendEntry}`);
		return;
	}
	backendProcess = (0, node_child_process.spawn)(resolveBunBin(), [backendEntry], {
		stdio: "inherit",
		env: {
			...process.env,
			PORT: String(backendPort),
			HOST: "127.0.0.1",
			CORS_ORIGIN: "*",
			DATA_DIR: (0, node_path.join)(electron.app.getPath("userData"), "runtime")
		}
	});
	backendProcess.once("exit", () => {
		backendProcess = null;
	});
}
function stopBackend() {
	if (!backendProcess) return;
	backendProcess.kill("SIGTERM");
	backendProcess = null;
}
function createWindow() {
	const window = new electron.BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 1100,
		minHeight: 700,
		autoHideMenuBar: true,
		webPreferences: {
			preload: (0, node_path.join)(__dirname$1, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});
	window.webContents.setWindowOpenHandler(({ url }) => {
		electron.shell.openExternal(url);
		return { action: "deny" };
	});
	if (isDevelopment) {
		window.loadURL(process.env.VITE_DEV_SERVER_URL);
		window.webContents.openDevTools({ mode: "detach" });
	} else window.loadFile(resolveWebIndexPath());
	window.on("closed", () => {
		if (mainWindow === window) mainWindow = null;
	});
	return window;
}
electron.app.whenReady().then(() => {
	startBackend();
	mainWindow = createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
	stopBackend();
});

//#endregion
//# sourceMappingURL=main.cjs.map