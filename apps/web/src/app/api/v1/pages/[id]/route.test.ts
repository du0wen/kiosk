import { describe, it, expect, afterEach } from "vitest";
import { GET, PUT, DELETE, PATCH } from "./route";
import { POST } from "../route";
import { createPrincipal, cleanupPrincipal, addMember } from "@/test/factories";
import { createPage } from "@/lib/pages";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const authGet = (t: string, id: string) =>
  new Request(`http://localhost/api/v1/pages/${id}`, {
    headers: { authorization: `Bearer ${t}` },
  });

async function createOne(token: string): Promise<string> {
  const res = await POST(
    new Request("http://localhost/api/v1/pages", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/html" },
      body: "<html><title>Orig</title></html>",
    }),
  );
  return (await res.json()).id as string;
}

describe("/api/v1/pages/[id]", () => {
  it("GET returns the page; PUT updates; DELETE soft-deletes; then 404", async () => {
    principal = await createPrincipal();
    const id = await createOne(principal.token);

    const g = await GET(authGet(principal.token, id), ctx(id));
    expect(g.status).toBe(200);
    expect((await g.json()).title).toBe("Orig");

    const p = await PUT(
      new Request(`http://localhost/api/v1/pages/${id}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${principal.token}`,
          "content-type": "text/html",
        },
        body: "<html><title>New</title></html>",
      }),
      ctx(id),
    );
    expect(p.status).toBe(200);

    const d = await DELETE(authGet(principal.token, id), ctx(id));
    expect(d.status).toBe(204);

    const after = await GET(authGet(principal.token, id), ctx(id));
    expect(after.status).toBe(404);
  });

  it("404 for an id in another org", async () => {
    principal = await createPrincipal();
    const id = await createOne(principal.token);
    const other = await createPrincipal();
    const res = await GET(authGet(other.token, id), ctx(id));
    expect(res.status).toBe(404);
    await cleanupPrincipal(other);
  });
});

describe("page authz + visibility (member)", () => {
  it("member cannot delete another member's page (403), can delete own", async () => {
    const owner = await createPrincipal();
    const m = await addMember(owner.organizationId, "member");
    try {
      const ownersPage = await createPage({
        organizationId: owner.organizationId,
        userId: owner.userId,
        html: "<h1>o</h1>",
      });
      const membersPage = await createPage({
        organizationId: owner.organizationId,
        userId: m.userId,
        html: "<h1>m</h1>",
      });
      const del = (t: string) =>
        new Request("http://localhost/x", {
          method: "DELETE",
          headers: { authorization: `Bearer ${t}` },
        });
      const forbidden = await DELETE(del(m.token), ctx(ownersPage.publicId));
      expect(forbidden.status).toBe(403);
      const ok = await DELETE(del(m.token), ctx(membersPage.publicId));
      expect(ok.status).toBe(204);
    } finally {
      await cleanupPrincipal(owner); // deletes both org pages first
      await db.delete(user).where(eq(user.id, m.userId)); // then the now-unreferenced member
    }
  });

  it("PATCH sets visibility to public", async () => {
    const owner = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: owner.organizationId,
        userId: owner.userId,
        html: "<h1>x</h1>",
      });
      const res = await PATCH(
        new Request("http://localhost/x", {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${owner.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ visibility: "public" }),
        }),
        ctx(page.publicId),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).visibility).toBe("public");
    } finally {
      await cleanupPrincipal(owner);
    }
  });
});
