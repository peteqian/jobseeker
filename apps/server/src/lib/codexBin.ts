/** Whether the codex CLI binary is on PATH (or at $CODEX_BIN) and runnable. */
export function isCodexAvailable(): boolean {
  const binPath = process.env.CODEX_BIN ?? "codex";
  try {
    const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
