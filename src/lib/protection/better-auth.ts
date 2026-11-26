import { ProtectionStoreError } from "./errors";
import { hashProtectionIdentifier } from "./identity";
import { consumeRateLimit } from "./limiter";
import type { ProtectionStore } from "./store";

export function createBetterAuthRateLimitStorage(
  store: ProtectionStore,
  keySecret: string,
  nowMs: () => number = Date.now,
) {
  return {
    async get() {
      throw new ProtectionStoreError();
    },
    async set() {
      throw new ProtectionStoreError();
    },
    async consume(key: string, rule: { window: number; max: number }) {
      const result = await consumeRateLimit(
        store,
        `auth:${hashProtectionIdentifier(keySecret, "better-auth", key)}`,
        { limit: rule.max, windowSeconds: rule.window },
        nowMs(),
      );
      return {
        allowed: result.allowed,
        retryAfter: result.allowed ? null : result.retryAfterSeconds,
      };
    },
  };
}
