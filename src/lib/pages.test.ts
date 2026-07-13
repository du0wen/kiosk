import { describe, it, expect, afterEach } from "vitest";
import {
  extractTitle,
  pageShellUrl,
  pageRawUrl,
  createPage,
  updatePage,
  getPage,
  softDeletePage,
  setPageVisibility,
  listPages,
  listPageVersions,
  getPageVersionContent,
  PageTooLargeError,
} from "./pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { db } from "@/db";
import { pages, pageVersion } from "@/db/schema";
import { eq } from "drizzle-orm";

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

describe("page urls", () => {
  it("rawUrl joins SERVE_ORIGIN /p/", () => {
    expect(pageRawUrl("abc123")).toBe(`${process.env.SERVE_ORIGIN}/p/abc123`);
  });
  it("shellUrl joins APP_ORIGIN /v/", () => {
    expect(pageShellUrl("abc123")).toBe(`${process.env.APP_ORIGIN}/v/abc123`);
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
      userId: principal.userId,
      html: "<html><title>Second</title></html>",
    });
    expect(updated?.title).toBe("Second");

    const list = await listPages({ organizationId: org });
    expect(list.items).toHaveLength(1);

    expect(
      await softDeletePage({
        publicId: created.publicId,
        organizationId: org,
        userId: principal.userId,
      }),
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
      await updatePage({
        publicId: created.publicId,
        organizationId: otherOrg,
        userId: principal.userId,
        html: "x",
      }),
    ).toBeNull();
    expect(
      await softDeletePage({
        publicId: created.publicId,
        organizationId: otherOrg,
        userId: principal.userId,
      }),
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

describe("pages service P2", () => {
  it("createPage defaults org visibility and writes a first version", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<title>A</title><h1>A</h1>",
      });
      expect(page.visibility).toBe("org");
      const versions = await db
        .select()
        .from(pageVersion)
        .where(eq(pageVersion.pageId, page.id));
      expect(versions).toHaveLength(1);
      expect(versions[0].editedBy).toBe(p.userId);
    } finally {
      await cleanupPrincipal(p);
    }
  });

  it("updatePage snapshots only on content change and sets updated_by", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>v1</h1>",
      });
      await updatePage({
        publicId: page.publicId,
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>v1</h1>",
      }); // same content
      let versions = await db
        .select()
        .from(pageVersion)
        .where(eq(pageVersion.pageId, page.id));
      expect(versions).toHaveLength(1); // unchanged → no new version
      const updated = await updatePage({
        publicId: page.publicId,
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>v2</h1>",
      });
      expect(updated?.updatedBy).toBe(p.userId);
      versions = await db
        .select()
        .from(pageVersion)
        .where(eq(pageVersion.pageId, page.id));
      expect(versions).toHaveLength(2);
    } finally {
      await cleanupPrincipal(p);
    }
  });

  it("setPageVisibility flips visibility; softDeletePage records deleted_by", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>x</h1>",
      });
      const pub = await setPageVisibility({
        publicId: page.publicId,
        organizationId: p.organizationId,
        userId: p.userId,
        visibility: "public",
      });
      expect(pub?.visibility).toBe("public");
      const ok = await softDeletePage({
        publicId: page.publicId,
        organizationId: p.organizationId,
        userId: p.userId,
      });
      expect(ok).toBe(true);
      const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
      expect(row.deletedBy).toBe(p.userId);
      expect(row.deletedAt).not.toBeNull();
    } finally {
      await cleanupPrincipal(p);
    }
  });
});

describe("listPageVersions", () => {
  it("returns versions newest-first with editor email", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>1</h1>",
      });
      await updatePage({
        publicId: page.publicId,
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>2</h1>",
      });
      const versions = await listPageVersions({
        publicId: page.publicId,
        organizationId: p.organizationId,
      });
      expect(versions).toHaveLength(2);
      expect(versions[0].editedByEmail).toContain("@");
    } finally {
      await cleanupPrincipal(p);
    }
  });
});

describe("getPageVersionContent", () => {
  it("returns a version's html (org-scoped)", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<h1>v1</h1>",
      });
      const versions = await listPageVersions({
        publicId: page.publicId,
        organizationId: p.organizationId,
      });
      const html = await getPageVersionContent({
        publicId: page.publicId,
        organizationId: p.organizationId,
        versionId: versions[0].id,
      });
      expect(html).toBe("<h1>v1</h1>");
      expect(
        await getPageVersionContent({
          publicId: page.publicId,
          organizationId: "nope",
          versionId: versions[0].id,
        }),
      ).toBeNull();
    } finally {
      await cleanupPrincipal(p);
    }
  });
});
