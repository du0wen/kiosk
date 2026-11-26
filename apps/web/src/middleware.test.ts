import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware security headers", () => {
  it("hardens trusted application responses", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost/kiosk");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-value");
    const response = middleware(
      new NextRequest("http://localhost:58671/pages", {
        headers: { host: "localhost:58671" },
      }),
    );

    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
  });

  it("does not add app anti-framing headers to raw served content", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost/kiosk");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-value");
    const response = middleware(
      new NextRequest("http://serve.kiosk.test:58671/p/page-id", {
        headers: { host: "serve.kiosk.test:58671" },
      }),
    );

    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("allows /setup requests to reach Node.js setup guards with app security headers", () => {
    const setupRes = middleware(
      new NextRequest("http://localhost:58671/setup", {
        headers: { host: "localhost:58671" },
      }),
    );
    expect(setupRes.status).toBe(200);
    expect(setupRes.headers.get("x-frame-options")).toBe("DENY");
  });
});
