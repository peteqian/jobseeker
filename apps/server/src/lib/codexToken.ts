import { readFileSync } from "node:fs";
import path from "node:path";

/** Decodes a JWT payload without verifying the signature (we only read `exp`). */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Seconds until the codex access token in `<codexHome>/auth.json` expires.
 *
 * Returns a negative number for an already-expired token and `null` when the
 * file/token can't be read or parsed (caller treats `null` as "refresh-prone",
 * since an unreadable token is at least as risky as an expiring one).
 */
export function codexAccessTokenSecondsToExpiry(codexHome: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(path.join(codexHome, "auth.json"), "utf8");
  } catch {
    return null;
  }
  let accessToken: unknown;
  try {
    accessToken = (JSON.parse(raw) as { tokens?: { access_token?: unknown } }).tokens?.access_token;
  } catch {
    return null;
  }
  if (typeof accessToken !== "string") return null;
  const payload = decodeJwtPayload(accessToken);
  const exp = payload?.exp;
  if (typeof exp !== "number") return null;
  return exp - Math.floor(Date.now() / 1000);
}
