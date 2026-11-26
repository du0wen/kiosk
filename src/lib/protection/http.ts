import { ProtectionStoreError } from "./errors";
import type { RateLimitResult } from "./limiter";
import { RateLimitExceededError } from "./limiter";

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: { code: "rate_limited", message: "Too many requests" } },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": String(result.remaining),
        "RateLimit-Reset": String(result.resetAtSeconds),
      },
    },
  );
}

export function protectionErrorResponse(error: unknown): Response | undefined {
  if (error instanceof RateLimitExceededError) return rateLimitResponse(error.result);
  if (!(error instanceof ProtectionStoreError)) return undefined;
  return Response.json(
    {
      error: {
        code: "protection_unavailable",
        message: "Runtime protection is unavailable",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
