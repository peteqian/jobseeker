#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const version = process.argv[2]?.trim();

if (!version) {
  console.error("Usage: node scripts/set-desktop-version.mjs <version>");
  process.exit(1);
}

const packageJsonPath = resolve(process.cwd(), "apps/desktop/package.json");
const raw = await readFile(packageJsonPath, "utf8");
const pkg = JSON.parse(raw);

pkg.version = version;

await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Set apps/desktop/package.json version to ${version}`);
