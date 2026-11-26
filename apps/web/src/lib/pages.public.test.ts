import { describe, it, expect, afterEach } from "vitest";
import {
  createPage,
  softDeletePage,
  getPublicPage,
  incrementViewCount,
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

describe("public serving access", () => {
  it("getPublicPage finds an active page without an org; misses deleted; view count bumps", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Pub</title></html>",
    });

    const got = await getPublicPage(page.publicId);
    expect(got?.id).toBe(page.id);

    await incrementViewCount(page.id);
    const after = await getPublicPage(page.publicId);
    expect(after?.viewCount).toBe(1);

    await softDeletePage({
      publicId: page.publicId,
      organizationId: principal.organizationId,
    });
    expect(await getPublicPage(page.publicId)).toBeNull();
  });
});
