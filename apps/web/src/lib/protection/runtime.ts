import { parseRuntimeConfig } from "@/lib/runtime-config";
import { ProtectionStoreError } from "./errors";
import { loadProtectionPolicy, type ProtectionPolicy } from "./policy";
import type { ProtectionStore } from "./store";
import { createProtectionStore } from "./store-factory";
import { InMemoryProtectionStore } from "./memory-store";

export type ProtectionRuntime = {
  store: ProtectionStore;
  policy: ProtectionPolicy;
  keySecret: string;
  trustedClientIpHeaders: string[];
};

let singleton: ProtectionRuntime | undefined;
export const PROTECTION_KEY_NAMESPACE = "kiosk:protection:v1";

export function createProtectionRuntime(
  env: Record<string, string | undefined>,
): ProtectionRuntime {
  if (
    env.NODE_ENV === "production" &&
    env.NEXT_PHASE === "phase-production-build"
  ) {
    return {
      store: new InMemoryProtectionStore(),
      policy: loadProtectionPolicy(env),
      keySecret: Buffer.alloc(32, 1).toString("base64"),
      trustedClientIpHeaders: ["x-vercel-forwarded-for"],
    };
  }
  try {
    const config = parseRuntimeConfig(env);
    return {
      store: createProtectionStore({
        nodeEnv: config.nodeEnv,
        redisRestUrl: config.protection.redisRestUrl,
        redisRestToken: config.secrets.rateLimitRedis?.reveal(),
        // Stable across rolling deployments so old and new instances share
        // protection state. Bump only for an intentional key-contract change.
        namespace: PROTECTION_KEY_NAMESPACE,
      }),
      policy: config.protection.policy,
      keySecret: config.secrets.rateLimitKey.reveal(),
      trustedClientIpHeaders: config.protection.trustedClientIpHeaders,
    };
  } catch {
    throw new ProtectionStoreError();
  }
}

export function getProtectionRuntime(): ProtectionRuntime {
  singleton ??= createProtectionRuntime(process.env);
  return singleton;
}
