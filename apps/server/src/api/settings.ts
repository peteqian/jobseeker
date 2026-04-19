import type { Hono } from "hono";
import {
  getProviderSettings,
  updateProviderSettings,
  type ProviderSettingsPatch,
} from "../lib/provider-settings";
import { buildOpenCodeAuthorizationHeader } from "../lib/opencode";

type ConnectionStatus = {
  name: string;
  id: string;
  ok: boolean;
  message: string;
};

async function checkCodex(): Promise<ConnectionStatus> {
  const { codex } = getProviderSettings();
  if (!codex.enabled) {
    return {
      name: "Codex",
      id: "codex",
      ok: false,
      message: "Disabled in provider settings.",
    };
  }
  const binPath = codex.binaryPath;

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
      message: `Binary not found at "${binPath}". Install Codex or update provider settings.`,
    };
  }
}

async function checkClaude(): Promise<ConnectionStatus> {
  const { claude } = getProviderSettings();
  if (!claude.enabled) {
    return {
      name: "Claude",
      id: "claude",
      ok: false,
      message: "Disabled in provider settings.",
    };
  }
  const binPath = claude.binaryPath;

  try {
    const proc = Bun.spawn([binPath, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return {
        name: "Claude",
        id: "claude",
        ok: false,
        message: `Binary exited with code ${exitCode}`,
      };
    }
    return {
      name: "Claude",
      id: "claude",
      ok: true,
      message: `Using binary: ${binPath}`,
    };
  } catch {
    return {
      name: "Claude",
      id: "claude",
      ok: false,
      message: `Binary not found at "${binPath}". Install Claude CLI or update settings.`,
    };
  }
}

async function checkOpenCode(): Promise<ConnectionStatus> {
  const { opencode } = getProviderSettings();
  if (!opencode.enabled) {
    return {
      name: "OpenCode",
      id: "opencode",
      ok: false,
      message: "Disabled in provider settings.",
    };
  }

  const binPath = opencode.binaryPath;

  if (opencode.serverUrl.trim()) {
    try {
      const response = await fetch(new URL("/app/providers", opencode.serverUrl), {
        headers: opencode.serverPassword.trim()
          ? { Authorization: buildOpenCodeAuthorizationHeader(opencode.serverPassword) }
          : undefined,
      });

      if (!response.ok) {
        return {
          name: "OpenCode",
          id: "opencode",
          ok: false,
          message: `OpenCode server returned ${response.status}.`,
        };
      }

      return {
        name: "OpenCode",
        id: "opencode",
        ok: true,
        message: `Connected to OpenCode server at ${opencode.serverUrl}`,
      };
    } catch {
      return {
        name: "OpenCode",
        id: "opencode",
        ok: false,
        message: `Couldn't reach the configured OpenCode server at ${opencode.serverUrl}.`,
      };
    }
  }

  try {
    const proc = Bun.spawn([binPath, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return {
        name: "OpenCode",
        id: "opencode",
        ok: false,
        message: `Binary exited with code ${exitCode}`,
      };
    }

    return {
      name: "OpenCode",
      id: "opencode",
      ok: true,
      message: `Using binary: ${binPath}`,
    };
  } catch {
    return {
      name: "OpenCode",
      id: "opencode",
      ok: false,
      message: `Binary not found at "${binPath}". Install OpenCode CLI or update provider settings.`,
    };
  }
}

export function registerSettingsRoutes(app: Hono) {
  app.get("/api/settings/providers", (c) => {
    return c.json({ providers: getProviderSettings() });
  });

  app.put("/api/settings/providers", async (c) => {
    const body = (await c.req.json().catch(() => null)) as ProviderSettingsPatch | null;

    if (!body) {
      return c.json({ error: "Invalid provider settings payload" }, 400);
    }

    const providers = updateProviderSettings(body);
    return c.json({ providers });
  });

  app.get("/api/settings/connections", async (c) => {
    const [codex, claude, opencode] = await Promise.all([
      checkCodex(),
      checkClaude(),
      checkOpenCode(),
    ]);

    return c.json({ connections: [codex, claude, opencode] });
  });
}
