import { describe, it, expect, afterEach, vi } from "vitest";
import { GET } from "./route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { createPage } from "@/lib/pages";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (t: string, id: string, fmt: string) =>
  new Request(`http://localhost/api/v1/pages/${id}/export?format=${fmt}`, {
    headers: { authorization: `Bearer ${t}` },
  });

describe("GET /api/v1/pages/[id]/export", () => {
  it("401 without a token", async () => {
    const res = await GET(
      new Request("http://x/api/v1/pages/z/export?format=md"),
      ctx("z"),
    );
    expect(res.status).toBe(401);
  });
  it("400 for an unknown format", async () => {
    principal = await createPrincipal();
    const p = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<h1>x</h1>",
    });
    const res = await GET(req(principal.token, p.publicId, "docx"), ctx(p.publicId));
    expect(res.status).toBe(400);
  });
  it("404 for a page in another org", async () => {
    principal = await createPrincipal();
    const other = await createPrincipal();
    try {
      const p = await createPage({
        organizationId: other.organizationId,
        userId: other.userId,
        html: "<h1>x</h1>",
      });
      const res = await GET(req(principal.token, p.publicId, "md"), ctx(p.publicId));
      expect(res.status).toBe(404);
    } finally {
      await cleanupPrincipal(other);
    }
  });
  it("md → 200 markdown attachment", async () => {
    principal = await createPrincipal();
    const p = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<h1>Hello</h1>",
    });
    const res = await GET(req(principal.token, p.publicId, "md"), ctx(p.publicId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(await res.text()).toContain("# Hello");
  });
  it("pdf → streams render bytes (render mocked)", async () => {
    principal = await createPrincipal();
    const p = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<h1>x</h1>",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    );
    const res = await GET(req(principal.token, p.publicId, "pdf"), ctx(p.publicId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
