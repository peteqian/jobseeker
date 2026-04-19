let electron = require("electron");

//#region src/preload.ts
electron.contextBridge.exposeInMainWorld("desktopBridge", { platform: process.platform });

//#endregion
//# sourceMappingURL=preload.cjs.map
