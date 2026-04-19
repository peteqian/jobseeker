import { defineConfig } from "drizzle-kit";
import os from "node:os";
import path from "node:path";

const dataDir = process.env.DATA_DIR ?? path.join(os.homedir(), ".jobseeker");
const dbPath = path.join(dataDir, "jobseeker.sqlite");

export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/server/src/db/schema.ts",
  out: "./apps/server/src/db/migrations",
  dbCredentials: {
    url: dbPath,
  },
});
