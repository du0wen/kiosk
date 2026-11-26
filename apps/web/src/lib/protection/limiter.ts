import type { RateLimitStore, SemaphoreStore, LeaseInput } from "./store";

export type RateLimitRule = { limit: number; windowSeconds: number };

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtSeconds: number;
  retryAfterSeconds: number;
};

export class RateLimitExceededError extends Error {
  readonly code = "rate_limited";

  constructor(public readonly result: RateLimitResult) {
    super("Too many requests");
    this.name = "RateLimitExceededError";
  }
}

export async function consumeRateLimit(
  store: RateLimitStore,
  key: string,
  rule: RateLimitRule,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const result = await store.consumeFixedWindow({
    key,
    limit: rule.limit,
    windowMs: rule.windowSeconds * 1_000,
    nowMs,
  });
  const retryAfterSeconds = result.allowed
    ? 0
    : Math.max(1, Math.ceil((result.resetAtMs - nowMs) / 1_000));
  return {
    allowed: result.allowed,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - result.count),
    resetAtSeconds: Math.ceil(result.resetAtMs / 1_000),
    retryAfterSeconds,
  };
}

export async function consumeSlidingRateLimit(
  store: RateLimitStore,
  key: string,
  eventId: string,
  rule: RateLimitRule,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const result = await store.consumeSlidingWindow({
    key,
    eventId,
    limit: rule.limit,
    windowMs: rule.windowSeconds * 1_000,
    nowMs,
  });
  const retryAfterSeconds = result.allowed
    ? 0
    : Math.max(1, Math.ceil((result.resetAtMs - nowMs) / 1_000));
  return {
    allowed: result.allowed,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - result.count),
    resetAtSeconds: Math.ceil(result.resetAtMs / 1_000),
    retryAfterSeconds,
  };
}

export async function withLease<T>(
  store: SemaphoreStore,
  input: LeaseInput,
  operation: () => Promise<T>,
): Promise<T> {
  const acquired = await store.acquireLease(input);
  if (!acquired) {
    const retryAfterSeconds = Math.max(1, Math.ceil(input.ttlMs / 1_000));
    throw new RateLimitExceededError({
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAtSeconds: Math.ceil((input.nowMs + input.ttlMs) / 1_000),
      retryAfterSeconds,
    });
  }
  try {
    const result = await operation();
    try {
      await store.releaseLease(input.key, input.leaseId);
    } catch {
      // The lease TTL is the crash-safe release path. Do not corrupt a completed result.
    }
    return result;
  } catch (error) {
    try {
      await store.releaseLease(input.key, input.leaseId);
    } catch {
      // Preserve the operation error; the lease expires independently.
    }
    throw error;
  }
}
