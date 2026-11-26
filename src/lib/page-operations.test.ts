import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addMember, cleanupPrincipal, createPrincipal } from "@/test/factories";
import type { Caller } from "./page-operations";
import {
  createPageForCaller,
  deletePageForCaller,
  getCallerProfile,
  getPageForCaller,
  listPagesForCaller,
  OperationError,
  setPageVisibilityForCaller,
  updatePageForCaller,
} from "./page-operations";

type Principal = Awaited<ReturnType<typeof createPrincipal>>;

let principals: Principal[] = [];
let extraUserIds: string[] = [];

afterEach(async () => {
  for (const principal of principals.reverse()) {
    await cleanupPrincipal(principal);
  }
  for (const userId of extraUserIds) {
    await db.delete(user).where(eq(user.id, userId));
  }
  principals = [];
  extraUserIds = [];
});

async function ownerCaller(): Promise<{ principal: Principal; caller: Caller }> {
  const principal = await createPrincipal();
  principals.push(principal);
  return {
    principal,
    caller: {
      userId: principal.userId,
      organizationId: principal.organizationId,
      role: "owner",
    },
  };
}

describe("page operations", () => {
  it("creates, lists, reads, updates visibility and content, then deletes", async () => {
    const { caller } = await ownerCaller();

    const created = await createPageForCaller(caller, {
      html: "<html><title>Original</title><body>secret</body></html>",
    });
    expect(created).toMatchObject({
      id: expect.stringMatching(/^[0-9A-Za-z]{12}$/),
      title: "Original",
      visibility: "org",
      url: expect.stringContaining(`/v/${created.id}`),
      rawUrl: expect.stringContaining(`/p/${created.id}`),
    });
    expect(created).not.toHaveProperty("contentHtml");
    expect(created).not.toHaveProperty("contentHash");

    const listed = await listPagesForCaller(caller, { limit: 1 });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toEqual(created);
    expect(listed.nextCursor).toBeNull();

    await expect(getPageForCaller(caller, created.id)).resolves.toEqual(created);

    const visible = await setPageVisibilityForCaller(caller, {
      pageId: created.id,
      visibility: "public",
    });
    expect(visible.visibility).toBe("public");

    const updated = await updatePageForCaller(caller, {
      pageId: created.id,
      html: "<html><title>Updated</title></html>",
    });
    expect(updated).toMatchObject({ id: created.id, title: "Updated" });

    await expect(deletePageForCaller(caller, created.id)).resolves.toEqual({
      id: created.id,
      deleted: true,
    });
    await expect(getPageForCaller(caller, created.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("returns caller profile without exposing membership or token records", async () => {
    const { principal, caller } = await ownerCaller();

    await expect(getCallerProfile(caller)).resolves.toMatchObject({
      user: { id: principal.userId, email: expect.any(String) },
      organization: { id: principal.organizationId, slug: expect.any(String) },
      role: "owner",
    });
  });

  it("enforces member ownership for visibility and delete", async () => {
    const { principal, caller: owner } = await ownerCaller();
    const member = await addMember(principal.organizationId, "member");
    extraUserIds.push(member.userId);
    const memberCaller: Caller = {
      userId: member.userId,
      organizationId: principal.organizationId,
      role: "member",
    };
    const ownersPage = await createPageForCaller(owner, { html: "<h1>Owner</h1>" });
    const membersPage = await createPageForCaller(memberCaller, {
      html: "<h1>Member</h1>",
    });

    await expect(
      setPageVisibilityForCaller(memberCaller, {
        pageId: ownersPage.id,
        visibility: "public",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(deletePageForCaller(memberCaller, ownersPage.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(deletePageForCaller(memberCaller, membersPage.id)).resolves.toMatchObject({
      deleted: true,
    });
  });

  it("validates operation input and hides cross-organization pages", async () => {
    const { caller } = await ownerCaller();
    const { caller: other } = await ownerCaller();
    const page = await createPageForCaller(caller, { html: "<h1>Private</h1>" });

    await expect(getPageForCaller(other, page.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(createPageForCaller(caller, { html: "   " })).rejects.toMatchObject({
      code: "bad_request",
    });
    await expect(
      createPageForCaller(caller, { html: "a".repeat(2 * 1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(listPagesForCaller(caller, { limit: 0 })).rejects.toBeInstanceOf(
      OperationError,
    );
    await expect(
      listPagesForCaller(caller, { cursor: "not-a-date" }),
    ).rejects.toMatchObject({ code: "bad_request" });
  });
});
