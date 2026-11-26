import type {
  FixedWindowInput,
  FixedWindowResult,
  LeaseInput,
  ProtectionStore,
  SlidingWindowInput,
} from "./store";
import { ProtectionStoreError } from "./errors";

const CONSUME_FIXED_WINDOW = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { count, ttl }
`;

const CONSUME_SLIDING_WINDOW = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
redis.call("ZADD", KEYS[1], "NX", ARGV[2], ARGV[3])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
local count = redis.call("ZCARD", KEYS[1])
local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
return { count, tonumber(oldest[2]) }
`;

const ACQUIRE_LEASE = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
local existing = redis.call("ZSCORE", KEYS[1], ARGV[2])
if existing then
  redis.call("ZADD", KEYS[1], ARGV[3], ARGV[2])
  redis.call("PEXPIRE", KEYS[1], ARGV[4])
  return 1
end
local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[5]) then
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[3], ARGV[2])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
return 1
`;

const RELEASE_LEASE = `
redis.call("ZREM", KEYS[1], ARGV[1])
return 1
`;

export interface RedisEvalClient {
  eval<TResult>(script: string, keys: string[], args: string[]): Promise<TResult>;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtectionStoreError();
  }
  return value;
}

export class RedisProtectionStore implements ProtectionStore {
  constructor(
    private readonly redis: RedisEvalClient,
    private readonly namespace = "kiosk",
  ) {}

  async consumeFixedWindow(input: FixedWindowInput): Promise<FixedWindowResult> {
    try {
      const result = await this.redis.eval<unknown>(
        CONSUME_FIXED_WINDOW,
        [`${this.namespace}:window:${input.key}`],
        [String(input.windowMs)],
      );
      if (!Array.isArray(result) || result.length !== 2) {
        throw new ProtectionStoreError();
      }
      const count = finiteNumber(result[0]);
      const ttl = finiteNumber(result[1]);
      return {
        allowed: count <= input.limit,
        count,
        resetAtMs: input.nowMs + (ttl > 0 ? ttl : input.windowMs),
      };
    } catch (error) {
      if (error instanceof ProtectionStoreError) throw error;
      throw new ProtectionStoreError();
    }
  }

  async consumeSlidingWindow(input: SlidingWindowInput): Promise<FixedWindowResult> {
    try {
      const result = await this.redis.eval<unknown>(
        CONSUME_SLIDING_WINDOW,
        [`${this.namespace}:sliding:${input.key}`],
        [
          String(input.nowMs - input.windowMs),
          String(input.nowMs),
          input.eventId,
          String(input.windowMs),
        ],
      );
      if (!Array.isArray(result) || result.length !== 2) {
        throw new ProtectionStoreError();
      }
      const count = finiteNumber(result[0]);
      const oldestAtMs = finiteNumber(result[1]);
      return {
        allowed: count <= input.limit,
        count,
        resetAtMs: oldestAtMs + input.windowMs,
      };
    } catch (error) {
      if (error instanceof ProtectionStoreError) throw error;
      throw new ProtectionStoreError();
    }
  }

  async acquireLease(input: LeaseInput): Promise<boolean> {
    try {
      const result = await this.redis.eval<unknown>(
        ACQUIRE_LEASE,
        [`${this.namespace}:lease:${input.key}`],
        [
          String(input.nowMs),
          input.leaseId,
          String(input.nowMs + input.ttlMs),
          String(input.ttlMs),
          String(input.limit),
        ],
      );
      const value = finiteNumber(result);
      if (value !== 0 && value !== 1) throw new ProtectionStoreError();
      return value === 1;
    } catch (error) {
      if (error instanceof ProtectionStoreError) throw error;
      throw new ProtectionStoreError();
    }
  }

  async releaseLease(key: string, leaseId: string): Promise<void> {
    try {
      await this.redis.eval<unknown>(
        RELEASE_LEASE,
        [`${this.namespace}:lease:${key}`],
        [leaseId],
      );
    } catch {
      throw new ProtectionStoreError();
    }
  }
}
