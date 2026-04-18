import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logInfo } from "../lib/log";
import { db } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const migrationsFolder = path.join(__dirname, "migrations");

  logInfo("db migrations start", { migrationsFolder });
  await migrate(db, { migrationsFolder });
  logInfo("db migrations done");
}
