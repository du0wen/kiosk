import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { publicId as newPublicId } from "@/lib/id";
import { createPrincipal, cleanupPrincipal, addMember } from "@/test/factories";
import { normalizePagesSummary, ownerOptions, pageOwnerLabel, queryConsolePages, listPageOwners, getPagesSummary } from "./rows";
import { parsePageListParams } from "./list-params";

const params = (raw: Record<string, string>) => parsePageListParams(raw);

async function seedPage(org: string, createdBy: string, o: { title: string | null; visibility: "public" | "org"; viewCount: number; updatedAt: Date; publicId?: string }) {
  await db.insert(pages).values({
    publicId: o.publicId ?? newPublicId(),
    organizationId: org,
    createdBy,
    title: o.title,
    contentHtml: "<h1>x</h1>",
    sizeBytes: 12,
    visibility: o.visibility,
    viewCount: o.viewCount,
    createdAt: o.updatedAt,
    updatedAt: o.updatedAt,
  });
}

describe("page console rows", () => {
  it("uses name, then email, then a localized fallback", () => {
    expect(pageOwnerLabel("Maya", "maya@example.com", "Unknown")).toBe("Maya");
    expect(pageOwnerLabel(null, "maya@example.com", "Unknown")).toBe("maya@example.com");
    expect(pageOwnerLabel(null, null, "Unknown")).toBe("Unknown");
  });
});

describe("ownerOptions (Owner filter, no self-duplicate)", () => {
  const rows = [
    { id: "u1", name: "Kevin", email: "kevin@x.com" },
    { id: "u2", name: "Alice", email: "alice@x.com" },
    { id: "u3", name: null, email: "bob@x.com" },
  ];
  it("excludes the current user, whose pages are covered by the Me option", () => {
    expect(ownerOptions(rows, "u1", "Unknown").map((o) => o.id)).toEqual(["u2", "u3"]);
  });
  it("keeps other owners with their real name / email label", () => {
    expect(ownerOptions(rows, "someone-else", "Unknown")).toEqual([
      { id: "u1", label: "Kevin" },
      { id: "u2", label: "Alice" },
      { id: "u3", label: "bob@x.com" },
    ]);
  });
});

describe("workspace summary", () => {
  it("normalizes counts and view totals, deriving org-only from the rest", () => {
    expect(normalizePagesSummary({ total: 5, publicCount: 2, totalViews: 40 })).toEqual({
      total: 5,
      publicCount: 2,
      orgCount: 3,
      totalViews: 40,
    });
  });

  it("coerces the string aggregates the SQL driver returns", () => {
    expect(normalizePagesSummary({ total: "5", publicCount: "2", totalViews: "40" })).toEqual({
      total: 5,
      publicCount: 2,
      orgCount: 3,
      totalViews: 40,
    });
  });

  it("treats an empty workspace and a null sum as zero", () => {
    expect(normalizePagesSummary({ total: 0, publicCount: 0, totalViews: null })).toEqual({
      total: 0,
      publicCount: 0,
      orgCount: 0,
      totalViews: 0,
    });
  });
});

describe("queryConsolePages", () => {
  let owner: Awaited<ReturnType<typeof createPrincipal>>;
  let other: Awaited<ReturnType<typeof createPrincipal>>;
  let u2: Awaited<ReturnType<typeof addMember>>;
  const T = (n: number) => new Date(Date.UTC(2026, 0, n));
  const p4Pub = "zzzp4publicid";

  beforeAll(async () => {
    owner = await createPrincipal();
    u2 = await addMember(owner.organizationId, "member");
    await seedPage(owner.organizationId, owner.userId, { title: "Alpha report", visibility: "public", viewCount: 50, updatedAt: T(4) });
    await seedPage(owner.organizationId, owner.userId, { title: "Beta", visibility: "org", viewCount: 10, updatedAt: T(3) });
    await seedPage(owner.organizationId, u2.userId, { title: "Gamma report", visibility: "public", viewCount: 30, updatedAt: T(2) });
    await seedPage(owner.organizationId, u2.userId, { title: null, visibility: "org", viewCount: 5, updatedAt: T(1), publicId: p4Pub });
    other = await createPrincipal();
    await seedPage(other.organizationId, other.userId, { title: "Elsewhere", visibility: "public", viewCount: 999, updatedAt: T(9) });
  });
  afterAll(async () => {
    await cleanupPrincipal(owner);
    await cleanupPrincipal(other);
    const { user } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(user).where(eq(user.id, u2.userId));
  });

  it("is org-scoped and counts the full match set", async () => {
    const { items, total } = await queryConsolePages(owner.organizationId, params({}), owner.userId);
    expect(total).toBe(4);
    expect(items.every((i) => i.title !== "Elsewhere")).toBe(true);
  });
  it("defaults to updated_desc", async () => {
    const { items } = await queryConsolePages(owner.organizationId, params({}), owner.userId);
    expect(items.map((i) => i.title)).toEqual(["Alpha report", "Beta", "Gamma report", null]);
  });
  it("filters by q across title and publicId (case-insensitive)", async () => {
    const byTitle = await queryConsolePages(owner.organizationId, params({ q: "REPORT" }), owner.userId);
    expect(byTitle.total).toBe(2);
    expect(byTitle.items.map((i) => i.title).sort()).toEqual(["Alpha report", "Gamma report"]);
    const byId = await queryConsolePages(owner.organizationId, params({ q: p4Pub }), owner.userId);
    expect(byId.total).toBe(1);
  });
  it("filters by visibility", async () => {
    expect((await queryConsolePages(owner.organizationId, params({ visibility: "public" }), owner.userId)).total).toBe(2);
    expect((await queryConsolePages(owner.organizationId, params({ visibility: "org" }), owner.userId)).total).toBe(2);
  });
  it("filters by owner me and by userId", async () => {
    expect((await queryConsolePages(owner.organizationId, params({ owner: "me" }), owner.userId)).total).toBe(2);
    expect((await queryConsolePages(owner.organizationId, params({ owner: u2.userId }), owner.userId)).total).toBe(2);
  });
  it("sorts by views_desc and title_asc", async () => {
    const views = await queryConsolePages(owner.organizationId, params({ sort: "views_desc" }), owner.userId);
    expect(views.items.map((i) => i.viewCount)).toEqual([50, 30, 10, 5]);
    const title = await queryConsolePages(owner.organizationId, params({ sort: "title_asc" }), owner.userId);
    expect(title.items.map((i) => i.title)).toEqual(["Alpha report", "Beta", "Gamma report", null]);
  });
  it("lists distinct page owners for the filter select", async () => {
    const owners = await listPageOwners(owner.organizationId);
    expect(new Set(owners.map((o) => o.id))).toEqual(new Set([owner.userId, u2.userId]));
  });
  it("keeps the org summary independent of filters", async () => {
    const summary = await getPagesSummary(owner.organizationId);
    expect(summary.total).toBe(4);
    expect(summary.publicCount).toBe(2);
  });
});

describe("queryConsolePages pagination", () => {
  let p: Awaited<ReturnType<typeof createPrincipal>>;
  beforeAll(async () => {
    p = await createPrincipal();
    for (let i = 0; i < 30; i++) {
      await seedPage(p.organizationId, p.userId, { title: `Page ${i}`, visibility: "org", viewCount: i, updatedAt: new Date(Date.UTC(2026, 1, 1, 0, i)) });
    }
  });
  afterAll(async () => cleanupPrincipal(p));

  it("returns 25 rows on page 1 and the remainder on page 2", async () => {
    const page1 = await queryConsolePages(p.organizationId, params({ page: "1" }), p.userId);
    expect(page1.items).toHaveLength(25);
    expect(page1.total).toBe(30);
    const page2 = await queryConsolePages(p.organizationId, params({ page: "2" }), p.userId);
    expect(page2.items).toHaveLength(5);
    expect(page2.total).toBe(30);
  });
});
