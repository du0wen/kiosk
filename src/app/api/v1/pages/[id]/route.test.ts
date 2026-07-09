import { describe, it, expect, afterEach } from "vitest";
import { GET, PUT, DELETE } from "./route";
import { POST } from "../route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

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
