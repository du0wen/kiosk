import type {
  FixedWindowInput,
  FixedWindowResult,
  LeaseInput,
  ProtectionStore,
  SlidingWindowInput,
} from "./store";

type Window = { count: number; resetAtMs: number };

export class InMemoryProtectionStore implements ProtectionStore {
  readonly #windows = new Map<string, Window>();
  readonly #slidingWindows = new Map<string, Map<string, number>>();
  readonly #leases = new Map<string, Map<string, number>>();

  async consumeFixedWindow(input: FixedWindowInput): Promise<FixedWindowResult> {
    const current = this.#windows.get(input.key);
    const window = !current || current.resetAtMs <= input.nowMs
      ? { count: 0, resetAtMs: input.nowMs + input.windowMs }
      : current;
    window.count += 1;
    this.#windows.set(input.key, window);
    return {
      allowed: window.count <= input.limit,
      count: window.count,
      resetAtMs: window.resetAtMs,
    };
  }

  async consumeSlidingWindow(input: SlidingWindowInput): Promise<FixedWindowResult> {
    const events = this.#slidingWindows.get(input.key) ?? new Map<string, number>();
    const cutoff = input.nowMs - input.windowMs;
    for (const [eventId, occurredAtMs] of events) {
      if (occurredAtMs <= cutoff) events.delete(eventId);
    }
    if (!events.has(input.eventId)) events.set(input.eventId, input.nowMs);
    this.#slidingWindows.set(input.key, events);
    const oldest = Math.min(...events.values());
    return {
      allowed: events.size <= input.limit,
      count: events.size,
      resetAtMs: oldest + input.windowMs,
    };
  }

  async acquireLease(input: LeaseInput): Promise<boolean> {
    const leases = this.#leases.get(input.key) ?? new Map<string, number>();
    for (const [leaseId, expiresAtMs] of leases) {
      if (expiresAtMs <= input.nowMs) leases.delete(leaseId);
    }
    if (leases.has(input.leaseId)) {
      leases.set(input.leaseId, input.nowMs + input.ttlMs);
      this.#leases.set(input.key, leases);
      return true;
    }
    if (leases.size >= input.limit) {
      this.#leases.set(input.key, leases);
      return false;
    }
    leases.set(input.leaseId, input.nowMs + input.ttlMs);
    this.#leases.set(input.key, leases);
    return true;
  }

  async releaseLease(key: string, leaseId: string): Promise<void> {
    const leases = this.#leases.get(key);
    if (!leases) return;
    leases.delete(leaseId);
    if (leases.size === 0) this.#leases.delete(key);
  }
}
