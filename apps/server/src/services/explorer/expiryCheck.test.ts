import { describe, expect, it } from "bun:test";

import { checkJobUrlExpired } from "./expiryCheck";

function fakeFetch(status: number, body = ""): typeof fetch {
  return (() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
}

describe("checkJobUrlExpired", () => {
  it("treats 404/410 as expired", async () => {
    expect(await checkJobUrlExpired("https://x.test/job", fakeFetch(404))).toBe(true);
    expect(await checkJobUrlExpired("https://x.test/job", fakeFetch(410))).toBe(true);
  });

  it("detects expiry markers in the page text", async () => {
    const body = "<html><body>This job is no longer advertised on SEEK.</body></html>";
    expect(await checkJobUrlExpired("https://x.test/job", fakeFetch(200, body))).toBe(true);
  });

  it("treats a live listing as not expired", async () => {
    const body = "<html><body>Software Engineer — apply now!</body></html>";
    expect(await checkJobUrlExpired("https://x.test/job", fakeFetch(200, body))).toBe(false);
  });

  it("treats network errors and server errors as inconclusive", async () => {
    const failing = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await checkJobUrlExpired("https://x.test/job", failing)).toBe(false);
    expect(await checkJobUrlExpired("https://x.test/job", fakeFetch(503))).toBe(false);
  });
});
