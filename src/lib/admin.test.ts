import { describe, it, expect, afterEach } from "vitest";
import { adminUnpublish } from "./admin";
import { createPage, getPublicPage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("adminUnpublish", () => {
  it("soft-deletes any page regardless of org", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>x</title></html>",
    });
    expect(await adminUnpublish(page.publicId)).toBe(true);
    expect(await getPublicPage(page.publicId)).toBeNull();
  });
});
