import {
  requireScope,
  requireToken,
  type AuthenticatedCaller,
} from "@/lib/api";
import type { TokenScope } from "@/lib/token-scopes";
import {
  enforceIdentifierLimit,
  enforceRequestIpLimit,
  type ProtectionGuardRuntime,
} from "./guard";
import { getProtectionRuntime } from "./runtime";

type ApiAccessRequirement = {
  scope: TokenScope;
  policy?: "apiWrite" | "apiExport";
};

type ApiAccessDependencies = ProtectionGuardRuntime & {
  authenticate: (request: Request) => Promise<AuthenticatedCaller>;
};

export async function requireApiAccess(
  request: Request,
  requirement: ApiAccessRequirement,
  dependencies?: ApiAccessDependencies,
): Promise<AuthenticatedCaller> {
  const caller = await requireRateLimitedCaller(request, dependencies);
  if (requirement.policy) {
    await consumeCallerPolicy(caller, requirement.policy, dependencies);
  }
  return requireScope(caller, requirement.scope);
}

export async function requireRateLimitedCaller(
  request: Request,
  dependencies?: ApiAccessDependencies,
): Promise<AuthenticatedCaller> {
  const runtime = dependencies ?? {
    ...getProtectionRuntime(),
    authenticate: requireToken,
    nowMs: Date.now,
  };
  await enforceRequestIpLimit(request, "apiPreAuth", "api-pre", runtime);

  const caller = await runtime.authenticate(request);
  await enforceIdentifierLimit(
    "apiGeneral",
    "api-general",
    [caller.tokenId, caller.organizationId],
    runtime,
  );
  return caller;
}

export async function consumeCallerPolicy(
  caller: AuthenticatedCaller,
  policyName: "apiWrite" | "apiExport",
  dependencies?: Omit<ApiAccessDependencies, "authenticate">,
): Promise<void> {
  const runtime = dependencies ?? {
    ...getProtectionRuntime(),
    nowMs: Date.now,
  };
  await enforceIdentifierLimit(
    policyName,
    policyName,
    [caller.tokenId, caller.organizationId],
    runtime,
  );
}
