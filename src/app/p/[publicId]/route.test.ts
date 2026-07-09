import { describe, it, expect, afterEach } from "vitest";
import { GET } from "./route";
import { createPage, softDeletePage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

const ctx = (publicId: string) => ({ params: Promise.resolve({ publicId }) });
const req = (publicId: string) => new Request(`http://serve.local/p/${publicId}`);

describe("GET /p/[publicId]", () => {
  it("serves the HTML with strict CSP + noindex, and increments views", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Hello</title><body>hi</body></html>",
    });

    const res = await GET(req(page.publicId), ctx(page.publicId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain(
      "connect-src 'none'",
    );
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(await res.text()).toContain("<body>hi</body>");
  });

  it("404 for a missing id", async () => {
    const res = await GET(req("doesnotexist1"), ctx("doesnotexist1"));
    expect(res.status).toBe(404);
  });

  it("404 after the page is soft-deleted", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Gone</title></html>",
    });
    await softDeletePage({
      publicId: page.publicId,
      organizationId: principal.organizationId,
    });
    const res = await GET(req(page.publicId), ctx(page.publicId));
    expect(res.status).toBe(404);
  });
});
