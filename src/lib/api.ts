import { verifyToken } from "@/lib/token";
import { db } from "@/db";
import { member } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { Role } from "@/lib/permissions";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
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
): Promise<{ userId: string; organizationId: string; role: Role }> {
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
  };
}
