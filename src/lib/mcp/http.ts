import type { McpHttpHandler } from "@modelcontextprotocol/server";
import { ApiError } from "@/lib/api";
import { requireRateLimitedCaller } from "@/lib/protection/api-access";
import { protectionErrorResponse } from "@/lib/protection/http";
import type { Caller } from "@/lib/page-operations";
import { createKioskMcpHandler } from "./server";

type Environment = Record<string, string | undefined>;

export type McpHttpConfig = {
  allowedHosts: string[];
  allowedOrigins: string[];
};

function commaList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hostname(value: string): string {
  const url = value.includes("://") ? new URL(value) : new URL(`http://${value}`);
  return url.hostname;
}

function origin(value: string): string {
  return new URL(value).origin;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function loadMcpHttpConfig(
  env: Environment = process.env,
): McpHttpConfig {
  if (!env.APP_ORIGIN) throw new Error("APP_ORIGIN is required for MCP");
  const appOrigin = origin(env.APP_ORIGIN);
  return {
    allowedHosts: unique([
      hostname(appOrigin),
      "localhost",
      "127.0.0.1",
      "[::1]",
      ...commaList(env.MCP_ALLOWED_HOSTS).map(hostname),
    ]),
    allowedOrigins: unique([
      appOrigin,
      ...commaList(env.MCP_ALLOWED_ORIGINS).map(origin),
    ]),
  };
}

function rejection(message: string, status = 403): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    },
    { status },
  );
}

function requestHostname(request: Request): string | null {
  const host = request.headers.get("host");
  if (!host || host.includes(",")) return null;
  try {
    return hostname(host);
  } catch {
    return null;
  }
}

export function validateMcpRequest(
  request: Request,
  config: McpHttpConfig,
): Response | undefined {
  const host = requestHostname(request);
  if (!host || !config.allowedHosts.includes(host)) {
    return rejection("Host not allowed");
  }
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== null) {
    let normalized: string;
    try {
      normalized = origin(requestOrigin);
    } catch {
      return rejection("Origin not allowed");
    }
    if (normalized !== requestOrigin || !config.allowedOrigins.includes(normalized)) {
      return rejection("Origin not allowed");
    }
  }
  return undefined;
}

function bearerChallenge(message: string): Response {
  return Response.json(
    { error: "invalid_token", error_description: message },
    {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    },
  );
}

export async function authenticateMcpRequest(
  request: Request,
  authenticate: (request: Request) => Promise<Caller> = requireRateLimitedCaller,
): Promise<Caller | Response> {
  try {
    return await authenticate(request);
  } catch (error) {
    const protectionResponse = protectionErrorResponse(error);
    if (protectionResponse) return protectionResponse;
    if (error instanceof ApiError && error.status === 401) {
      return bearerChallenge(error.message);
    }
    if (error instanceof ApiError && error.status === 403) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: 403 },
      );
    }
    return Response.json(
      { error: { code: "internal", message: "Internal server error" } },
      { status: 500 },
    );
  }
}

type McpHandler = Pick<McpHttpHandler, "fetch" | "close">;

type McpHttpDependencies = {
  config?: McpHttpConfig;
  authenticate?: (request: Request) => Promise<Caller | Response>;
  createHandler?: (caller: Caller) => McpHandler;
};

function withCors(response: Response, request: Request): Response {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", requestOrigin);
  headers.append("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleMcpPost(
  request: Request,
  dependencies: McpHttpDependencies = {},
): Promise<Response> {
  const config = dependencies.config ?? loadMcpHttpConfig();
  const invalid = validateMcpRequest(request, config);
  if (invalid) return invalid;

  const caller = await (dependencies.authenticate ?? authenticateMcpRequest)(request);
  if (caller instanceof Response) return withCors(caller, request);

  const handler = (dependencies.createHandler ?? createKioskMcpHandler)(caller);
  try {
    return withCors(await handler.fetch(request), request);
  } catch {
    return withCors(rejection("Internal server error", 500), request);
  } finally {
    await handler.close();
  }
}

export function handleMcpOptions(
  request: Request,
  config: McpHttpConfig = loadMcpHttpConfig(),
): Response {
  const invalid = validateMcpRequest(request, config);
  if (invalid) return invalid;
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) return rejection("Origin required");
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": requestOrigin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers":
        "Authorization, Content-Type, MCP-Protocol-Version, MCP-Method, MCP-Name",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}
