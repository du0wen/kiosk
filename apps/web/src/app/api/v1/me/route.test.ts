import { describe, it, expect, afterEach } from "vitest";
import { GET } from "./route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("GET /api/v1/me", () => {
  it("401 without a token", async () => {
    const res = await GET(new Request("http://localhost/api/v1/me"));
    expect(res.status).toBe(401);
  });
  it("returns the user and org for a valid token", async () => {
    principal = await createPrincipal();
    const res = await GET(
      new Request("http://localhost/api/v1/me", {
        headers: { authorization: `Bearer ${principal.token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(principal.userId);
    expect(body.organization.id).toBe(principal.organizationId);
    expect(body.role).toBe("owner");
  });
});
