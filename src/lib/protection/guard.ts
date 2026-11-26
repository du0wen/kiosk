import { extractClientIp, hashProtectionIdentifier } from "./identity";
import { consumeRateLimit, RateLimitExceededError } from "./limiter";
import type { ProtectionPolicy, RateLimitName } from "./policy";
import { getProtectionRuntime } from "./runtime";
import type { ProtectionStore } from "./store";

export type ProtectionGuardRuntime = {
  store: ProtectionStore;
  policy: Readonly<ProtectionPolicy>;
  keySecret: string;
  trustedClientIpHeaders: readonly string[];
  nowMs: () => number;
};

function defaultRuntime(): ProtectionGuardRuntime {
  return {
    ...getProtectionRuntime(),
    nowMs: Date.now,
  };
}

export async function enforceIdentifierLimit(
  name: RateLimitName,
  domain: string,
  identifiers: readonly string[],
  runtime: ProtectionGuardRuntime = defaultRuntime(),
): Promise<void> {
  const identifier = hashProtectionIdentifier(
    runtime.keySecret,
    domain,
    ...identifiers,
  );
  const result = await consumeRateLimit(
    runtime.store,
    `${domain}:${identifier}`,
    runtime.policy.rateLimits[name],
    runtime.nowMs(),
  );
  if (!result.allowed) throw new RateLimitExceededError(result);
}

export async function enforceRequestIpLimit(
  request: Request,
  name: RateLimitName,
  domain: string,
  runtime: ProtectionGuardRuntime = defaultRuntime(),
): Promise<void> {
  await enforceRequestLimit(request, name, domain, [], runtime);
}

export async function enforceRequestLimit(
  request: Request,
  name: RateLimitName,
  domain: string,
  dimensions: readonly string[],
  runtime: ProtectionGuardRuntime = defaultRuntime(),
): Promise<void> {
  const ip = extractClientIp(request.headers, runtime.trustedClientIpHeaders);
  await enforceIdentifierLimit(name, domain, [ip, ...dimensions], runtime);
}
