type LogData = Record<string, unknown>;

function cleanValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => cleanValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanValue(item)]),
  );
}

function write(level: "info" | "warn" | "error", msg: string, data?: LogData) {
  const payload: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    msg,
  };

  if (data) {
    Object.assign(payload, cleanValue(data));
  }

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function logInfo(msg: string, data?: LogData) {
  write("info", msg, data);
}

export function logWarn(msg: string, data?: LogData) {
  write("warn", msg, data);
}

export function logError(msg: string, data?: LogData) {
  write("error", msg, data);
}
