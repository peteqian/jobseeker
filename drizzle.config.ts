import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, ".");
const dataDir = process.env.DATA_DIR ?? path.join(repoRoot, ".jobseeker-data");
const dbPath = path.join(dataDir, "jobseeker.sqlite");

export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/server/src/db/schema.ts",
  out: "./apps/server/src/db/migrations",
  dbCredentials: {
    url: dbPath,
  },
});
