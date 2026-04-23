import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export function ensureCodexAuthInHome(codexHome: string, sourceHome?: string): void {
  mkdirSync(codexHome, { recursive: true });
  const homeDir = process.env.HOME;
  if (!homeDir) return;

  const normalizedSourceHome = sourceHome?.trim();
  const candidates: Array<{ src: string; dest: string }> = [
    ...(normalizedSourceHome
      ? [
          {
            src: path.join(normalizedSourceHome, "auth.json"),
            dest: path.join(codexHome, "auth.json"),
          },
          {
            src: path.join(normalizedSourceHome, "config.toml"),
            dest: path.join(codexHome, "config.toml"),
          },
        ]
      : []),
    { src: path.join(homeDir, ".codex", "auth.json"), dest: path.join(codexHome, "auth.json") },
    {
      src: path.join(homeDir, ".codex", "config.toml"),
      dest: path.join(codexHome, "config.toml"),
    },
    {
      src: path.join(homeDir, ".config", "codex", "auth.json"),
      dest: path.join(codexHome, "auth.json"),
    },
    {
      src: path.join(homeDir, ".config", "codex", "config.toml"),
      dest: path.join(codexHome, "config.toml"),
    },
  ];

  for (const { src, dest } of candidates) {
    if (!existsSync(src) || existsSync(dest)) continue;
    copyFileSync(src, dest);
  }
}

export function buildCodexEnvironment(codexHome?: string): Record<string, string> | undefined {
  if (!codexHome) return undefined;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.CODEX_HOME = codexHome;
  return env;
}
