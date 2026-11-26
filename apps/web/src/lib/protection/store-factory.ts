import { Redis } from "@upstash/redis";
import { ProtectionStoreError } from "./errors";
import { InMemoryProtectionStore } from "./memory-store";
import { RedisProtectionStore } from "./redis-store";
import type { ProtectionStore } from "./store";

type StoreConfig = {
  nodeEnv: "development" | "test" | "production";
  redisRestUrl: string | null;
  redisRestToken?: string;
  namespace?: string;
};

export function createProtectionStore(config: StoreConfig): ProtectionStore {
  if (!config.redisRestUrl) {
    if (config.nodeEnv === "production") throw new ProtectionStoreError();
    return new InMemoryProtectionStore();
  }
  if (!config.redisRestToken) throw new ProtectionStoreError();
  const redis = new Redis({
    url: config.redisRestUrl,
    token: config.redisRestToken,
  });
  return new RedisProtectionStore(redis, config.namespace ?? "kiosk");
}
