import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pages, pageVersion } from "@/db/schema";
import { uuidv7, publicId } from "@/lib/id";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string } | null = null;
const pageIds: string[] = [];

afterEach(async () => {
  for (const id of pageIds.splice(0)) {
    await db.delete(pageVersion).where(eq(pageVersion.pageId, id));
    await db.delete(pages).where(eq(pages.id, id));
  }
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("pages P2 columns", () => {
  it("defaults visibility to 'org' and leaves updated_by/deleted_by null", async () => {
    principal = await createPrincipal();
    const id = uuidv7();
    pageIds.push(id);
    await db.insert(pages).values({
      id,
      publicId: publicId(),
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>hi</h1>",
      sizeBytes: 11,
    });
    const [row] = await db.select().from(pages).where(eq(pages.id, id));
    expect(row.visibility).toBe("org");
    expect(row.updatedBy).toBeNull();
    expect(row.deletedBy).toBeNull();
  });
});

describe("page_version", () => {
  it("stores a snapshot linked to a page", async () => {
    principal = await createPrincipal();
    const id = uuidv7();
    pageIds.push(id);
    await db.insert(pages).values({
      id,
      publicId: publicId(),
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>v1</h1>",
      sizeBytes: 11,
    });
    await db.insert(pageVersion).values({
      pageId: id,
      contentHtml: "<h1>v1</h1>",
      title: "V1",
      editedBy: principal.userId,
    });
    const rows = await db
      .select()
      .from(pageVersion)
      .where(eq(pageVersion.pageId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].contentHtml).toBe("<h1>v1</h1>");
    expect(rows[0].editedBy).toBe(principal.userId);
  });
});
