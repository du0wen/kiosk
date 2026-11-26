import { describe, expect, it, vi } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";
import {
  consumeRateLimit,
  consumeSlidingRateLimit,
  RateLimitExceededError,
  withLease,
} from "./limiter";

describe("consumeRateLimit", () => {
  it("converts store counts into stable rate-limit metadata", async () => {
    const store = new InMemoryProtectionStore();
    const rule = { limit: 2, windowSeconds: 10 };

    await expect(consumeRateLimit(store, "key", rule, 5_000)).resolves.toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAtSeconds: 15,
      retryAfterSeconds: 0,
    });
    await consumeRateLimit(store, "key", rule, 5_000);
    await expect(consumeRateLimit(store, "key", rule, 5_000)).resolves.toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAtSeconds: 15,
      retryAfterSeconds: 10,
    });
  });
});

describe("consumeSlidingRateLimit", () => {
  it("returns stable metadata from sliding-window events", async () => {
    const store = new InMemoryProtectionStore();
    const rule = { limit: 1, windowSeconds: 10 };
    await consumeSlidingRateLimit(store, "key", "a", rule, 5_000);
    await expect(
      consumeSlidingRateLimit(store, "key", "b", rule, 6_000),
    ).resolves.toEqual({
      allowed: false,
      limit: 1,
      remaining: 0,
      resetAtSeconds: 15,
      retryAfterSeconds: 9,
    });
  });
});

describe("withLease", () => {
  it("releases the permit after success and failure", async () => {
    const store = new InMemoryProtectionStore();
    const release = vi.spyOn(store, "releaseLease");
    const input = { key: "render", leaseId: "a", limit: 1, ttlMs: 1_000, nowMs: 0 };

    await expect(withLease(store, input, async () => "ok")).resolves.toBe("ok");
    await expect(
      withLease(store, { ...input, leaseId: "b" }, async () => {
        throw new Error("render failed");
      }),
    ).rejects.toThrow("render failed");
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("rejects without running work when concurrency is exhausted", async () => {
    const store = new InMemoryProtectionStore();
    const input = { key: "render", leaseId: "a", limit: 1, ttlMs: 1_000, nowMs: 0 };
    await store.acquireLease(input);
    const operation = vi.fn();

    await expect(
      withLease(store, { ...input, leaseId: "b" }, operation),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(operation).not.toHaveBeenCalled();
  });
});
