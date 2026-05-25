import os from "node:os";
import path from "node:path";

// Point the db at a throwaway dir BEFORE the db module reads DATA_DIR, so tests
// never touch the real ~/.jobseeker database. The db module is pulled in only
// after these env vars are set (via the dynamic import below).
process.env.NODE_ENV = "test";
process.env.DATA_DIR = path.join(os.tmpdir(), `jobseeker-test-${process.pid}-${Date.now()}`);

const { runMigrations } = await import("../src/db/migrate");
await runMigrations();
