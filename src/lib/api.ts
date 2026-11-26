import { verifyToken } from "@/lib/token";
import { db } from "@/db";
import { member } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { Role } from "@/lib/permissions";
import { OperationError } from "@/lib/page-operations";
import { ContentRepositoryError } from "@/lib/storage/content-repository";
import type { TokenScope } from "@/lib/token-scopes";
import { protectionErrorResponse } from "@/lib/protection/http";
import { QuotaExceededError } from "@/lib/quota";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(err: unknown): Response {
  const protectionResponse = protectionErrorResponse(err);
  if (protectionResponse) return protectionResponse;
  if (err instanceof QuotaExceededError) {
    return Response.json(
      {
        error: {
          code: err.code,
          message: err.message,
          quota: err.quota,
          current: err.current,
          limit: err.limit,
        },
      },
      { status: 409 },
    );
  }
  if (err instanceof ContentRepositoryError && err.code === "storage_unavailable") {
    return Response.json(
      { error: { code: "storage_unavailable", message: "Content storage is unavailable" } },
      { status: 503 },
    );
  }
  if (err instanceof OperationError) {
    const status = {
      bad_request: 400,
      forbidden: 403,
      not_found: 404,
      too_large: 413,
      storage_unavailable: 503,
    }[err.code];
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status },
    );
  }
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status, headers: err.headers },
    );
  }
  console.error("Unhandled API error:", err);
  return Response.json(
    { error: { code: "internal", message: "Internal server error" } },
    { status: 500 },
  );
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Verify the Bearer token; return caller identity + org role, or throw ApiError. */
export async function requireToken(
  req: Request,
): Promise<AuthenticatedCaller> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "unauthorized", "Missing Bearer token");
  const identity = await verifyToken(match[1]);
  if (!identity) {
    throw new ApiError(401, "unauthorized", "Invalid or revoked token");
  }
  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, identity.userId),
        eq(member.organizationId, identity.organizationId),
      ),
    )
    .limit(1);
  if (!m) {
    throw new ApiError(403, "forbidden", "Not a member of this organization");
  }
  return {
    userId: identity.userId,
    organizationId: identity.organizationId,
    role: m.role as Role,
    tokenId: identity.tokenId,
    scopes: identity.scopes,
  };
}

export type AuthenticatedCaller = {
  userId: string;
  organizationId: string;
  role: Role;
  tokenId: string;
  scopes: TokenScope[];
};

export function requireScope<T extends AuthenticatedCaller>(
  caller: T,
  scope: TokenScope,
): T {
  if (!caller.scopes.includes(scope)) {
    throw new ApiError(
      403,
      "insufficient_scope",
      "Token does not grant the required scope",
      { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}"` },
    );
  }
  return caller;
}
