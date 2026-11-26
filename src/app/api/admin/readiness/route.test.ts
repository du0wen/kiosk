import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/console", () => ({
  isAdminEmail: vi.fn(),
}));

vi.mock("@/lib/operations/readiness", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/operations/readiness")>();
  return {
    ...actual,
    checkDependencyReadiness: vi.fn(),
  };
});

import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/console";
import { checkDependencyReadiness } from "@/lib/operations/readiness";

describe("GET /api/admin/readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when unauthenticated or not an admin email", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(isAdminEmail).mockReturnValue(false);

    const req = new Request("http://localhost:3000/api/admin/readiness");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 200 and report with no-store cache when admin and healthy", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", email: "admin@example.com", name: "Admin" },
      session: { id: "s1", userId: "u1", expiresAt: new Date() },
    } as any);
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(checkDependencyReadiness).mockResolvedValue({
      status: "ok",
      checks: {
        database: { status: "ok", latencyMs: 2 },
      },
      timestamp: "2026-11-10T00:00:00.000Z",
    });

    const req = new Request("http://localhost:3000/api/admin/readiness");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("ok");
  });

  it("returns 503 when overall status is unavailable", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", email: "admin@example.com", name: "Admin" },
      session: { id: "s1", userId: "u1", expiresAt: new Date() },
    } as any);
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(checkDependencyReadiness).mockResolvedValue({
      status: "unavailable",
      checks: {
        database: { status: "unavailable", latencyMs: 10, errorCode: "database_unavailable" },
      },
      timestamp: "2026-11-10T00:00:00.000Z",
    });

    const req = new Request("http://localhost:3000/api/admin/readiness");
    const res = await GET(req);

    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("unavailable");
  });
});
