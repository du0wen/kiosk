import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { abuseReports, pages } from "@/db/schema";
import { uuidv7, publicId } from "@/lib/id";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { submitAbuseReport } from "./abuse";
import { getPublicPage, blockPage, unblockPage } from "./pages";

let principal: { userId: string; organizationId: string } | null = null;
const pageIds: string[] = [];
const reportIds: string[] = [];

afterEach(async () => {
  for (const id of reportIds.splice(0)) {
    await db.delete(abuseReports).where(eq(abuseReports.id, id));
  }
  for (const id of pageIds.splice(0)) {
    await db.delete(pages).where(eq(pages.id, id));
  }
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("abuse reporting and page blocking", () => {
  it("submits an abuse report, links to page if exists, and hashes IP", async () => {
    principal = await createPrincipal();
    const pid = uuidv7();
    const pubId = publicId();
    pageIds.push(pid);

    await db.insert(pages).values({
      id: pid,
      publicId: pubId,
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>hello</h1>",
      sizeBytes: 14,
    });

    const report = await submitAbuseReport({
      pageUrl: `https://kiosk.test/v/${pubId}`,
      reason: "Phishing login form detected",
      reporterIp: "203.0.113.42",
    });

    reportIds.push(report.id);
    expect(report.publicId).toBe(pubId);
    expect(report.pageId).toBe(pid);
    expect(report.details).toBe("Phishing login form detected");
    expect(report.status).toBe("pending");
    // IP must be hashed, never stored raw
    expect(report.reporterIpHash).not.toContain("203.0.113.42");
    expect(report.reporterIpHash).toHaveLength(64); // SHA-256
  });

  it("blocks a page, causing getPublicPage to return null, and allows unblocking", async () => {
    principal = await createPrincipal();
    const pid = uuidv7();
    const pubId = publicId();
    pageIds.push(pid);

    await db.insert(pages).values({
      id: pid,
      publicId: pubId,
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>hello</h1>",
      sizeBytes: 14,
    });

    // Publicly accessible before block
    const before = await getPublicPage(pubId);
    expect(before).not.toBeNull();
    expect(before?.id).toBe(pid);

    // Block page
    const blocked = await blockPage({ publicId: pubId, reason: "Phishing confirmation" });
    expect(blocked).toBe(true);

    // After block, getPublicPage returns null
    const after = await getPublicPage(pubId);
    expect(after).toBeNull();

    // Unblock page
    const unblocked = await unblockPage(pubId);
    expect(unblocked).toBe(true);

    const restored = await getPublicPage(pubId);
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe(pid);
  });
});
