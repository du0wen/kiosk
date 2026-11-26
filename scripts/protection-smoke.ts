import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { RedisProtectionStore } from "../src/lib/protection/redis-store";

const url = process.env.RATE_LIMIT_REDIS_REST_URL;
const token = process.env.RATE_LIMIT_REDIS_REST_TOKEN;
if (!url || !token) {
  throw new Error("Protection smoke requires Redis REST configuration");
}

const namespace = `kiosk:smoke:${randomUUID()}`;
const store = new RedisProtectionStore(new Redis({ url, token }), namespace);
const nowMs = Date.now();
const window = await store.consumeFixedWindow({
  key: "opaque-check",
  limit: 1,
  windowMs: 1_000,
  nowMs,
});
if (!window.allowed || window.count !== 1) {
  throw new Error("Protection rate-limit smoke failed");
}
const leaseId = randomUUID();
const acquired = await store.acquireLease({
  key: "opaque-render",
  leaseId,
  limit: 1,
  ttlMs: 5_000,
  nowMs,
});
if (!acquired) throw new Error("Protection lease smoke failed");
await store.releaseLease("opaque-render", leaseId);

console.log("Protection store smoke passed");
