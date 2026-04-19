import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";

export type { OpencodeClient };

export function buildOpenCodeAuthorizationHeader(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}`;
}

export function createOpenCodeSdkClient(input: {
  readonly baseUrl: string;
  readonly directory: string;
  readonly serverPassword?: string;
}): OpencodeClient {
  return createOpencodeClient({
    baseUrl: input.baseUrl,
    directory: input.directory,
    ...(input.serverPassword
      ? {
          headers: {
            Authorization: buildOpenCodeAuthorizationHeader(input.serverPassword),
          },
        }
      : {}),
    throwOnError: true,
  });
}

const DEFAULT_HOSTNAME = "127.0.0.1";
const SERVER_READY_PREFIX = "opencode server listening";

export interface OpenCodeServerConnection {
  readonly url: string;
  readonly process: ChildProcess | null;
  readonly external: boolean;
  close(): void;
}

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, DEFAULT_HOSTNAME, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function parseServerUrlFromOutput(output: string): string | null {
  for (const line of output.split("\n")) {
    if (!line.startsWith(SERVER_READY_PREFIX)) {
      continue;
    }
    const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
    return match?.[1] ?? null;
  }
  return null;
}

export async function startOpenCodeServerProcess(input: {
  readonly binaryPath: string;
  readonly port?: number;
  readonly hostname?: string;
  readonly timeoutMs?: number;
}): Promise<OpenCodeServerConnection> {
  const hostname = input.hostname ?? DEFAULT_HOSTNAME;
  const port = input.port ?? (await findAvailablePort());
  const timeoutMs = input.timeoutMs ?? 5_000;
  const child = spawn(input.binaryPath, ["serve", `--hostname=${hostname}`, `--port=${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    child.kill();
  };

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      close();
      reject(new Error(`Timed out waiting for OpenCode server start after ${timeoutMs}ms.`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
    };

    const onStdout = (chunk: string) => {
      stdout += chunk;
      const parsed = parseServerUrlFromOutput(stdout);
      if (!parsed) return;
      cleanup();
      resolve(parsed);
    };

    const onStderr = (chunk: string) => {
      stderr += chunk;
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          [
            `OpenCode server exited before startup completed (${signal ? `signal: ${signal}` : `code: ${code ?? "unknown"}`}).`,
            stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
            stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      );
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("close", onClose);
  });

  return { url, process: child, external: false, close };
}

export async function connectToOpenCodeServer(input: {
  readonly binaryPath: string;
  readonly serverUrl?: string | null;
}): Promise<OpenCodeServerConnection> {
  const serverUrl = input.serverUrl?.trim();
  if (serverUrl) {
    return { url: serverUrl, process: null, external: true, close() {} };
  }

  return startOpenCodeServerProcess({ binaryPath: input.binaryPath });
}
