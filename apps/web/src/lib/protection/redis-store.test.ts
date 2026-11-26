import { describe, expect, it, vi } from "vitest";
import { ProtectionStoreError } from "./errors";
import { RedisProtectionStore } from "./redis-store";

describe("RedisProtectionStore", () => {
  it("maps the atomic fixed-window result without exposing the logical key", async () => {
    const evalCommand = vi.fn().mockResolvedValue([2, 800]);
    const store = new RedisProtectionStore({ eval: evalCommand }, "test");

    await expect(
      store.consumeFixedWindow({
        key: "api:secret-identifier",
        limit: 3,
        windowMs: 1_000,
        nowMs: 5_000,
      }),
    ).resolves.toEqual({ allowed: true, count: 2, resetAtMs: 5_800 });
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      ["test:window:api:secret-identifier"],
      ["1000"],
    );
  });

  it("uses one atomic sorted-set command for lease acquisition and idempotent release", async () => {
    const evalCommand = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const store = new RedisProtectionStore({ eval: evalCommand }, "test");

    await expect(
      store.acquireLease({
        key: "render:org",
        leaseId: "lease-1",
        limit: 2,
        ttlMs: 120_000,
        nowMs: 5_000,
      }),
    ).resolves.toBe(true);
    await expect(store.releaseLease("render:org", "lease-1")).resolves.toBeUndefined();
    expect(evalCommand.mock.calls[0][1]).toEqual(["test:lease:render:org"]);
    expect(evalCommand.mock.calls[1][1]).toEqual(["test:lease:render:org"]);
  });

  it("uses one atomic sorted-set command for a sliding window", async () => {
    const evalCommand = vi.fn().mockResolvedValue([2, 4_500]);
    const store = new RedisProtectionStore({ eval: evalCommand }, "test");
    await expect(store.consumeSlidingWindow({
      key: "auth:opaque",
      eventId: "event-2",
      limit: 3,
      windowMs: 1_000,
      nowMs: 5_000,
    })).resolves.toEqual({ allowed: true, count: 2, resetAtMs: 5_500 });
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining("ZREMRANGEBYSCORE"),
      ["test:sliding:auth:opaque"],
      ["4000", "5000", "event-2", "1000"],
    );
  });

  it("converts provider and malformed responses to a sanitized store error", async () => {
    const providerSecret = "provider-secret-body";
    const evalCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error(providerSecret))
      .mockResolvedValueOnce(["bad"]);
    const store = new RedisProtectionStore({ eval: evalCommand }, "test");
    const input = { key: "key", limit: 1, windowMs: 1_000, nowMs: 1 };

    await expect(store.consumeFixedWindow(input)).rejects.toBeInstanceOf(
      ProtectionStoreError,
    );
    await expect(store.consumeFixedWindow(input)).rejects.toBeInstanceOf(
      ProtectionStoreError,
    );
    try {
      await store.consumeFixedWindow(input);
    } catch (error) {
      expect(String(error)).not.toContain(providerSecret);
    }
  });
});
