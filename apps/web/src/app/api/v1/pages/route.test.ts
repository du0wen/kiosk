import { describe, it, expect, afterEach } from "vitest";
import { POST, GET } from "./route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

function post(token: string | null, body: string, title?: string): Request {
  return new Request("http://localhost/api/v1/pages", {
    method: "POST",
    headers: {
      "content-type": "text/html",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(title ? { "x-kiosk-title": title } : {}),
    },
    body,
  });
}

describe("POST /api/v1/pages", () => {
  it("401 without a token", async () => {
    const res = await POST(post(null, "<html></html>"));
    expect(res.status).toBe(401);
  });
  it("creates a page and returns its url", async () => {
    principal = await createPrincipal();
    const res = await POST(post(principal.token, "<html><title>Hi</title></html>"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toContain("/v/"); // shell URL
    expect(body.rawUrl).toContain("/p/"); // raw content URL
    expect(body.id).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it("413 when body exceeds 2MB", async () => {
    principal = await createPrincipal();
    const res = await POST(post(principal.token, "a".repeat(2 * 1024 * 1024 + 10)));
    expect(res.status).toBe(413);
  });
});

describe("GET /api/v1/pages", () => {
  it("lists the caller's pages", async () => {
    principal = await createPrincipal();
    await POST(post(principal.token, "<html><title>One</title></html>"));
    const res = await GET(
      new Request("http://localhost/api/v1/pages", {
        headers: { authorization: `Bearer ${principal.token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0].url).toContain("/v/");
    expect(body.pages[0].rawUrl).toContain("/p/");
  });
});
