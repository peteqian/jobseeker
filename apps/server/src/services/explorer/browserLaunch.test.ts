import { describe, expect, it } from "bun:test";

import { isAuthFailure, isModelInfraFailure } from "./browserLaunch";

describe("isAuthFailure", () => {
  it("matches genuine auth/credential failures", () => {
    for (const s of [
      "ERROR: refresh_token_reused",
      "Your authentication token has been invalidated", // token_invalidated
      "401 Unauthorized",
      "Please sign in again",
      "token_expired",
      "re-authenticate Codex",
    ]) {
      expect(isAuthFailure(s)).toBe(true);
    }
  });

  it("does NOT match generic codex crashes", () => {
    for (const s of [
      "Codex exited with code 1: rate limit exceeded",
      "model decision failed: timeout",
      "Reached max steps (40)",
      "extract_content returned no listings",
    ]) {
      expect(isAuthFailure(s)).toBe(false);
    }
  });
});

describe("isModelInfraFailure", () => {
  it("matches model-layer failures so the anti-bot retry is skipped", () => {
    expect(isModelInfraFailure("Codex exited with code 1: 429")).toBe(true);
    expect(isModelInfraFailure("model decision failed")).toBe(true);
    expect(isModelInfraFailure("refresh_token_reused")).toBe(true); // auth ⊂ infra
  });

  it("does not match a plain page/interstitial summary", () => {
    expect(isModelInfraFailure("Just a moment... captcha challenge")).toBe(false);
  });
});
