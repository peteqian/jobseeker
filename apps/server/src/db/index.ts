import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";

import { dataDir, dbPath, env } from "../env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __jobseekerSqlite: Database | undefined;
};

mkdirSync(dataDir, { recursive: true });

export const sqlite = globalForDb.__jobseekerSqlite ?? new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");

if (env.NODE_ENV !== "production") {
  globalForDb.__jobseekerSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });

export type DatabaseClient = typeof db;
