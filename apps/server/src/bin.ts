import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./env";
import { registerHealthRoutes } from "./api/health";
import { registerSettingsRoutes } from "./api/settings";
import { registerProjectRoutes } from "./api/projects";
import { registerResumeRoutes } from "./api/resumes";
import { registerQuestionRoutes } from "./api/questions";
import { registerExplorerRoutes } from "./api/explorer";
import { registerTaskRoutes } from "./api/tasks";
import { registerEventRoutes } from "./api/events";
import { logError, logInfo } from "./lib/log";
import { runMigrations } from "./db/migrate";
import { startWsServer } from "./ws";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGIN,
  }),
);

app.use("/api/*", async (c, next) => {
  const start = Date.now();

  await next();

  logInfo("api request", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  });
});

app.onError((error, c) => {
  logError("api request failed", {
    method: c.req.method,
    path: c.req.path,
    error,
  });

  throw error;
});

registerHealthRoutes(app);
registerSettingsRoutes(app);
registerProjectRoutes(app);
registerResumeRoutes(app);
registerQuestionRoutes(app);
registerExplorerRoutes(app);
registerTaskRoutes(app);
registerEventRoutes(app);

logInfo("http server boot", {
  host: env.HOST,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
});

await runMigrations();

const server = Bun.serve({
  fetch: app.fetch,
  hostname: env.HOST,
  port: env.PORT,
});

logInfo("http server listening", {
  url: `http://${env.HOST}:${server.port}`,
});

// Start the WebSocket RPC server on a separate port
startWsServer();
