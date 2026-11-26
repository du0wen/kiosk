import { randomUUID } from "node:crypto";
import { hashProtectionIdentifier } from "./identity";
import { consumeRateLimit, RateLimitExceededError, withLease } from "./limiter";
import type { ProtectionPolicy } from "./policy";
import { getProtectionRuntime } from "./runtime";
import type { ProtectionStore } from "./store";

const RENDER_LEASE_TTL_MS = 120_000;

type RenderProtectionDependencies = {
  store: ProtectionStore;
  policy: Readonly<ProtectionPolicy>;
  keySecret: string;
  nowMs: () => number;
  leaseId: () => string;
};

function defaultDependencies(): RenderProtectionDependencies {
  return {
    ...getProtectionRuntime(),
    nowMs: Date.now,
    leaseId: randomUUID,
  };
}

export async function protectRender<T>(
  organizationId: string,
  operation: () => Promise<T>,
  dependencies: RenderProtectionDependencies = defaultDependencies(),
): Promise<T> {
  const nowMs = dependencies.nowMs();
  const orgKey = hashProtectionIdentifier(
    dependencies.keySecret,
    "render-org",
    organizationId,
  );
  const daily = await consumeRateLimit(
    dependencies.store,
    `render-daily:${orgKey}`,
    dependencies.policy.rateLimits.renderDaily,
    nowMs,
  );
  if (!daily.allowed) throw new RateLimitExceededError(daily);

  return withLease(
    dependencies.store,
    {
      key: `render-concurrency:${orgKey}`,
      leaseId: dependencies.leaseId(),
      limit: dependencies.policy.quotas.renderConcurrency,
      ttlMs: RENDER_LEASE_TTL_MS,
      nowMs,
    },
    operation,
  );
}
