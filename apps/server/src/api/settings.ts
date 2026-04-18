import type { Hono } from "hono";

type ConnectionStatus = {
  name: string;
  id: string;
  ok: boolean;
  message: string;
};

async function checkCodex(): Promise<ConnectionStatus> {
  const binPath = process.env.CODEX_BIN ?? "codex";

  try {
    const proc = Bun.spawn([binPath, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    if (exitCode === 0) {
      return {
        name: "Codex",
        id: "codex",
        ok: true,
        message: `Found: ${stdout.trim() || binPath}`,
      };
    }

    return {
      name: "Codex",
      id: "codex",
      ok: false,
      message: `Binary exited with code ${exitCode}`,
    };
  } catch {
    return {
      name: "Codex",
      id: "codex",
      ok: false,
      message: `Binary not found at "${binPath}". Install Codex or set CODEX_BIN.`,
    };
  }
}

function checkClaude(): ConnectionStatus {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return {
      name: "Claude",
      id: "claude",
      ok: false,
      message: "ANTHROPIC_API_KEY is not set.",
    };
  }

  const masked = `${key.slice(0, 8)}...${key.slice(-4)}`;
  return {
    name: "Claude",
    id: "claude",
    ok: true,
    message: `API key configured (${masked})`,
  };
}

export function registerSettingsRoutes(app: Hono) {
  app.get("/api/settings/connections", async (c) => {
    const [codex, claude] = await Promise.all([checkCodex(), Promise.resolve(checkClaude())]);

    return c.json({ connections: [codex, claude] });
  });
}
