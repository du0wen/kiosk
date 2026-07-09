import { verifyToken } from "@/lib/token";

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

/** Verify the Bearer token; return caller identity or throw ApiError(401). */
export async function requireToken(
  req: Request,
): Promise<{ userId: string; organizationId: string }> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "unauthorized", "Missing Bearer token");
  const identity = await verifyToken(match[1]);
  if (!identity) {
    throw new ApiError(401, "unauthorized", "Invalid or revoked token");
  }
  return { userId: identity.userId, organizationId: identity.organizationId };
}
