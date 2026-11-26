import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, getPage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal, addMember } from "@/test/factories";

const h = vi.hoisted(() => ({ session: null as { user: { id: string } } | null, org: null as string | null, role: null as string | null }));
vi.mock("@/lib/session", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/console", () => ({ resolveActiveOrg: async () => h.org, roleInOrg: async () => h.role }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { deletePageAction, renamePageAction, setPageVisibilityAction } from "./page-actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("shared page actions (server-authoritative)", () => {
  let owner: Awaited<ReturnType<typeof createPrincipal>>;
  let member: Awaited<ReturnType<typeof addMember>>;
  afterEach(async () => {
    if (owner) {
      // cleanupPrincipal hard-deletes the org's pages first, so the extra
      // member's user row is no longer referenced when we delete it.
      await cleanupPrincipal(owner);
      if (member) {
        const { db } = await import("@/db");
        const { user } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(user).where(eq(user.id, member.userId));
      }
    }
  });
  beforeEach(async () => {
    owner = await createPrincipal();
    member = await addMember(owner.organizationId, "member");
    h.org = owner.organizationId;
  });

  it("lets a member delete their own page and reports ok", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: member.userId, html: "<h1>mine</h1>" });
    h.session = { user: { id: member.userId } }; h.role = "member";
    expect(await deletePageAction(fd({ id: page.publicId }))).toEqual({ ok: true });
    expect(await getPage({ publicId: page.publicId, organizationId: owner.organizationId })).toBeNull();
  });

  it("forbids a member from deleting another member's page (forbidden, no delete)", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: owner.userId, html: "<h1>not mine</h1>" });
    h.session = { user: { id: member.userId } }; h.role = "member";
    expect(await deletePageAction(fd({ id: page.publicId }))).toEqual({ ok: false, error: "forbidden" });
    expect(await getPage({ publicId: page.publicId, organizationId: owner.organizationId })).not.toBeNull();
  });

  it("lets an admin delete any page and reports ok", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: member.userId, html: "<h1>theirs</h1>" });
    h.session = { user: { id: owner.userId } }; h.role = "admin";
    expect(await deletePageAction(fd({ id: page.publicId }))).toEqual({ ok: true });
    expect(await getPage({ publicId: page.publicId, organizationId: owner.organizationId })).toBeNull();
  });

  it("lets any member rename any page and reports ok", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: owner.userId, html: "<h1>x</h1>" });
    h.session = { user: { id: member.userId } }; h.role = "member";
    expect(await renamePageAction(fd({ id: page.publicId, title: "Renamed" }))).toEqual({ ok: true });
    expect((await getPage({ publicId: page.publicId, organizationId: owner.organizationId }))?.title).toBe("Renamed");
  });

  it("forbids a member from changing another's visibility (forbidden, unchanged)", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: owner.userId, html: "<h1>x</h1>", visibility: "org" });
    h.session = { user: { id: member.userId } }; h.role = "member";
    expect(await setPageVisibilityAction(fd({ id: page.publicId, to: "public" }))).toEqual({ ok: false, error: "forbidden" });
    expect((await getPage({ publicId: page.publicId, organizationId: owner.organizationId }))?.visibility).toBe("org");
  });

  it("lets a member change the visibility of their own page and reports ok", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: member.userId, html: "<h1>x</h1>", visibility: "org" });
    h.session = { user: { id: member.userId } }; h.role = "member";
    expect(await setPageVisibilityAction(fd({ id: page.publicId, to: "public" }))).toEqual({ ok: true });
    expect((await getPage({ publicId: page.publicId, organizationId: owner.organizationId }))?.visibility).toBe("public");
  });

  it("returns unauthenticated when there is no session", async () => {
    h.session = null; h.role = null;
    expect(await deletePageAction(fd({ id: "whatever" }))).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("returns not_found for a page that is not in the active org", async () => {
    h.session = { user: { id: owner.userId } }; h.role = "owner";
    expect(await deletePageAction(fd({ id: "missing000001" }))).toEqual({ ok: false, error: "not_found" });
    expect(await setPageVisibilityAction(fd({ id: "missing000001", to: "public" }))).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects an empty rename title as invalid_input", async () => {
    const page = await createPage({ organizationId: owner.organizationId, userId: owner.userId, html: "<h1>x</h1>", title: "Keep" });
    h.session = { user: { id: member.userId } }; h.role = "member";
    expect(await renamePageAction(fd({ id: page.publicId, title: "   " }))).toEqual({ ok: false, error: "invalid_input" });
    expect((await getPage({ publicId: page.publicId, organizationId: owner.organizationId }))?.title).toBe("Keep");
  });
});
