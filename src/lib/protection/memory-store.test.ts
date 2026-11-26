import { describe, expect, it } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";

describe("InMemoryProtectionStore", () => {
  it("atomically consumes a fixed window and reports reset metadata", async () => {
    const store = new InMemoryProtectionStore();
    const input = { key: "api:key", limit: 2, windowMs: 1_000, nowMs: 5_000 };

    await expect(store.consumeFixedWindow(input)).resolves.toEqual({
      allowed: true,
      count: 1,
      resetAtMs: 6_000,
    });
    await expect(store.consumeFixedWindow(input)).resolves.toEqual({
      allowed: true,
      count: 2,
      resetAtMs: 6_000,
    });
    await expect(store.consumeFixedWindow(input)).resolves.toEqual({
      allowed: false,
      count: 3,
      resetAtMs: 6_000,
    });
    await expect(
      store.consumeFixedWindow({ ...input, nowMs: 6_001 }),
    ).resolves.toMatchObject({ allowed: true, count: 1 });
  });

  it("acquires bounded expiring leases and releases idempotently", async () => {
    const store = new InMemoryProtectionStore();
    const base = { key: "render:org", limit: 2, ttlMs: 1_000, nowMs: 5_000 };

    await expect(store.acquireLease({ ...base, leaseId: "a" })).resolves.toBe(true);
    await expect(store.acquireLease({ ...base, leaseId: "b" })).resolves.toBe(true);
    await expect(store.acquireLease({ ...base, leaseId: "c" })).resolves.toBe(false);
    await expect(store.releaseLease(base.key, "a")).resolves.toBeUndefined();
    await expect(store.releaseLease(base.key, "a")).resolves.toBeUndefined();
    await expect(store.acquireLease({ ...base, leaseId: "c" })).resolves.toBe(true);
    await expect(
      store.acquireLease({ ...base, leaseId: "d", nowMs: 6_001 }),
    ).resolves.toBe(true);
  });

  it("atomically consumes a sliding window and expires old events", async () => {
    const store = new InMemoryProtectionStore();
    const base = { key: "auth", limit: 2, windowMs: 1_000 };
    await expect(store.consumeSlidingWindow({ ...base, eventId: "a", nowMs: 5_000 })).resolves.toMatchObject({ allowed: true, count: 1, resetAtMs: 6_000 });
    await expect(store.consumeSlidingWindow({ ...base, eventId: "b", nowMs: 5_500 })).resolves.toMatchObject({ allowed: true, count: 2, resetAtMs: 6_000 });
    await expect(store.consumeSlidingWindow({ ...base, eventId: "c", nowMs: 5_600 })).resolves.toMatchObject({ allowed: false, count: 3 });
    await expect(store.consumeSlidingWindow({ ...base, eventId: "d", nowMs: 6_001 })).resolves.toMatchObject({ allowed: false, count: 3, resetAtMs: 6_500 });
  });
});
