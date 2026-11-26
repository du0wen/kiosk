import { NextRequest, NextResponse } from "next/server";
import {
  classifyOperationalError,
  parseRequestId,
  type OperationEventInput,
  type OperationalErrorCode,
} from "./events";
import { createRequestId } from "./request-id";
import { getOperationsLogger } from "./runtime";
import type { OperationsLogger } from "./logger";

export type ObservedRouteCategory =
  | "rest"
  | "mcp"
  | "cli_auth"
  | "auth"
  | "report"
  | "serving"
  | "console"
  | "operator";

export type RouteContext = {
  requestId: string;
  setOrganizationHash: (hash: string) => void;
  emitEvent: (input: OperationEventInput) => Promise<void>;
};

export type ObservedRouteHandler<T = unknown> = (
  req: NextRequest,
  ctx: RouteContext,
  routeParams?: T,
) => Promise<Response>;

export type WithObservedRouteOptions = {
  logger?: OperationsLogger;
};

function resolveRequestId(req: NextRequest): string {
  const headerValue = req.headers.get("x-request-id");
  if (headerValue) {
    try {
      return parseRequestId(headerValue);
    } catch {
      // Invalid format, generate fresh id below
    }
  }
  return createRequestId();
}

const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

function resolveMethod(method: string): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" {
  const upper = method.toUpperCase();
  return VALID_METHODS.has(upper)
    ? (upper as "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD")
    : "GET";
}

export function withObservedRoute<T = unknown>(
  category: ObservedRouteCategory,
  handler: ObservedRouteHandler<T>,
  options?: WithObservedRouteOptions,
) {
  return async (req: NextRequest, routeParams?: T): Promise<Response> => {
    const logger = options?.logger ?? getOperationsLogger();
    const requestId = resolveRequestId(req);
    const start = Date.now();
    let organizationHash: string | undefined;

    const ctx: RouteContext = {
      requestId,
      setOrganizationHash: (hash: string) => {
        organizationHash = hash;
      },
      emitEvent: async (input: OperationEventInput) => {
        try {
          await logger.emit(input);
        } catch {
          // Operational logger failure must never crash request execution
        }
      },
    };

    let response: Response;
    let errorCode: OperationalErrorCode | undefined;

    try {
      response = await handler(req, ctx, routeParams);
    } catch (err: unknown) {
      errorCode = classifyOperationalError(err);

      await ctx.emitEvent({
        name: "unexpected.error",
        requestId,
        routeCategory: category,
        ...(organizationHash ? { organizationHash } : {}),
        errorCode,
      });

      response = NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    const latencyMs = Math.max(0, Math.min(300_000, Date.now() - start));
    const status = response.status;

    // Attach X-Request-Id header to response
    try {
      response.headers.set("x-request-id", requestId);
    } catch {
      // If immutable headers (rare in NextResponse), clone or ignore
    }

    // Determine error code for 4xx/5xx responses if not already set
    if (!errorCode) {
      if (status === 401) errorCode = "unauthorized";
      else if (status === 403) errorCode = "forbidden";
      else if (status === 404) errorCode = "not_found";
      else if (status === 429) errorCode = "rate_limited";
      else if (status === 409) errorCode = "quota_exceeded";
      else if (status >= 500) errorCode = "internal";
      else if (status >= 400) errorCode = "bad_request";
    }

    await ctx.emitEvent({
      name: "request.completed",
      requestId,
      routeCategory: category,
      method: resolveMethod(req.method),
      status,
      latencyMs,
      ...(organizationHash ? { organizationHash } : {}),
      ...(errorCode ? { errorCode } : {}),
    });

    return response;
  };
}
