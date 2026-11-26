import { describe, expect, it } from "vitest";
import { createPage, updatePage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { getConsolePageDetail } from "./page-detail";

describe("getConsolePageDetail", () => {
  it("returns detail fields without content_html, org-scoped", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<title>Report</title><h1>hi</h1>", visibility: "public" });
      const detail = await getConsolePageDetail(p.organizationId, page.publicId);
      expect(detail).not.toBeNull();
      expect(detail!.title).toBe("Report");
      expect(detail!.visibility).toBe("public");
      expect(detail!.ownerEmail).toContain("@");
      expect(detail!.sizeBytes).toBeGreaterThan(0);
      expect(detail!.versionCount).toBe(1);
      // Must not ship the full HTML to the client.
      expect("contentHtml" in (detail as object)).toBe(false);
      // Cross-org lookup must not leak.
      expect(await getConsolePageDetail("some-other-org", page.publicId)).toBeNull();
    } finally {
      await cleanupPrincipal(p);
    }
  });

  it("counts versions and caps recent versions at 5", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>v0</h1>" });
      for (let i = 1; i <= 6; i++) {
        await updatePage({ publicId: page.publicId, organizationId: p.organizationId, userId: p.userId, html: `<h1>v${i}</h1>` });
      }
      const detail = await getConsolePageDetail(p.organizationId, page.publicId);
      expect(detail!.versionCount).toBe(7);
      expect(detail!.recentVersions).toHaveLength(5);
      expect(detail!.recentVersions[0].editor).toContain("@");
    } finally {
      await cleanupPrincipal(p);
    }
  });
});
