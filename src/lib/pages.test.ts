import { describe, it, expect, afterEach } from "vitest";
import {
  extractTitle,
  pageUrl,
  createPage,
  updatePage,
  getPage,
  softDeletePage,
  listPages,
  PageTooLargeError,
} from "./pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("extractTitle", () => {
  it("pulls the <title>", () => {
    expect(
      extractTitle("<html><head><title> Hi </title></head></html>"),
    ).toBe("Hi");
  });
  it("returns null when absent", () => {
    expect(extractTitle("<div>no title</div>")).toBeNull();
  });
});

describe("pageUrl", () => {
  it("joins SERVE_ORIGIN and /p/<id>", () => {
    expect(pageUrl("abc123")).toBe(`${process.env.SERVE_ORIGIN}/p/abc123`);
  });
});

describe("page CRUD", () => {
  it("creates, reads, updates, lists, and soft-deletes within the org", async () => {
    principal = await createPrincipal();
    const org = principal.organizationId;

    const created = await createPage({
      organizationId: org,
      userId: principal.userId,
      html: "<html><title>First</title></html>",
    });
    expect(created.publicId).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(created.title).toBe("First");

    const fetched = await getPage({ publicId: created.publicId, organizationId: org });
    expect(fetched?.contentHtml).toContain("First");

    const updated = await updatePage({
      publicId: created.publicId,
      organizationId: org,
      html: "<html><title>Second</title></html>",
    });
    expect(updated?.title).toBe("Second");

    const list = await listPages({ organizationId: org });
    expect(list.items).toHaveLength(1);

    expect(
      await softDeletePage({ publicId: created.publicId, organizationId: org }),
    ).toBe(true);
    expect(
      await getPage({ publicId: created.publicId, organizationId: org }),
    ).toBeNull();
  });

  it("does not touch pages from another org", async () => {
    principal = await createPrincipal();
    const created = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Mine</title></html>",
    });
    const otherOrg = "org-does-not-exist";
    expect(
      await getPage({ publicId: created.publicId, organizationId: otherOrg }),
    ).toBeNull();
    expect(
      await updatePage({ publicId: created.publicId, organizationId: otherOrg, html: "x" }),
    ).toBeNull();
    expect(
      await softDeletePage({ publicId: created.publicId, organizationId: otherOrg }),
    ).toBe(false);
  });

  it("rejects pages over 2MB", async () => {
    principal = await createPrincipal();
    const big = "<html>" + "a".repeat(2 * 1024 * 1024 + 1) + "</html>";
    await expect(
      createPage({
        organizationId: principal.organizationId,
        userId: principal.userId,
        html: big,
      }),
    ).rejects.toBeInstanceOf(PageTooLargeError);
  });
});
