export function buildCodexEnvironment(codexHome?: string): Record<string, string> | undefined {
  if (!codexHome) return undefined;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.CODEX_HOME = codexHome;
  return env;
}
