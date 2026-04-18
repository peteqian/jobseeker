import { z } from "zod";
import os from "node:os";
import path from "node:path";

/**
 * Environment variable schema validation
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_DIR: z.string().optional(),
  CORS_ORIGIN: z.string().default("*"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z
    .string()
    .default("3456")
    .transform((val) => parseInt(val, 10)),
  ANTHROPIC_API_KEY: z.string().optional(),
});

/**
 * Parse and validate environment variables
 */
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

/**
 * Computed paths
 */
export const dataDir = env.DATA_DIR ?? path.join(os.homedir(), ".jobseeker");
export const dbPath = path.join(dataDir, "jobseeker.sqlite");
