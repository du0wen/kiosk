import { describe, expect, it } from "vitest";
import { protectionErrorResponse, rateLimitResponse } from "./http";
import { ProtectionStoreError } from "./errors";
import { RateLimitExceededError } from "./limiter";

describe("protection HTTP responses", () => {
  it("returns stable 429 JSON and standard retry metadata", async () => {
    const response = rateLimitResponse({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAtSeconds: 1_700_000_100,
      retryAfterSeconds: 42,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("ratelimit-limit")).toBe("10");
    expect(response.headers.get("ratelimit-remaining")).toBe("0");
    expect(response.headers.get("ratelimit-reset")).toBe("1700000100");
    await expect(response.json()).resolves.toEqual({
      error: { code: "rate_limited", message: "Too many requests" },
    });
  });

  it("maps only protection-store failures to a sanitized 503", async () => {
    const response = protectionErrorResponse(new ProtectionStoreError());
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: "protection_unavailable",
        message: "Runtime protection is unavailable",
      },
    });
    expect(protectionErrorResponse(new Error("other"))).toBeUndefined();
  });

  it("maps a limiter exception through the same HTTP boundary", () => {
    const result = {
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAtSeconds: 20,
      retryAfterSeconds: 10,
    };
    expect(protectionErrorResponse(new RateLimitExceededError(result))?.status).toBe(429);
  });
});
