import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // electron is a devDependency (electron-builder requires that), but it
  // must never be bundled — it resolves at runtime inside the app shell.
  external: ["electron", "electron-updater"],
  inlineOnly: false,
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
]);
