import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { codexAccessTokenSecondsToExpiry } from "./codexToken";

function jwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function writeAuth(contents: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-token-"));
  writeFileSync(path.join(dir, "auth.json"), JSON.stringify(contents));
  return dir;
}

describe("codexAccessTokenSecondsToExpiry", () => {
  it("returns positive seconds for a token expiring in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const dir = writeAuth({ tokens: { access_token: jwtWithExp(future) } });
    const s = codexAccessTokenSecondsToExpiry(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(540);
    expect(s!).toBeLessThanOrEqual(600);
  });

  it("returns negative for an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 600;
    const dir = writeAuth({ tokens: { access_token: jwtWithExp(past) } });
    const s = codexAccessTokenSecondsToExpiry(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(s!).toBeLessThan(0);
  });

  it("returns null when auth.json is missing", () => {
    expect(codexAccessTokenSecondsToExpiry("/no/such/codex/home")).toBeNull();
  });

  it("returns null when the token isn't a decodable JWT", () => {
    const dir = writeAuth({ tokens: { access_token: "not-a-jwt" } });
    const s = codexAccessTokenSecondsToExpiry(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(s).toBeNull();
  });
});
