import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { abuseReports, pages } from "@/db/schema";
import { uuidv7, publicId } from "@/lib/id";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

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

describe("abuse_reports and blocked_at schema", () => {
  it("allows setting blocked_at and blocked_reason on a page", async () => {
    principal = await createPrincipal();
    const pid = uuidv7();
    pageIds.push(pid);
    const pubId = publicId();
    await db.insert(pages).values({
      id: pid,
      publicId: pubId,
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>test</h1>",
      sizeBytes: 13,
      blockedAt: new Date(),
      blockedReason: "phishing report confirmed",
    });

    const [row] = await db.select().from(pages).where(eq(pages.id, pid));
    expect(row.blockedAt).toBeInstanceOf(Date);
    expect(row.blockedReason).toBe("phishing report confirmed");
  });

  it("persists an abuse report with default status 'pending'", async () => {
    const reportId = uuidv7();
    reportIds.push(reportId);

    await db.insert(abuseReports).values({
      id: reportId,
      pageUrl: "https://serve.example.test/p/abcdef123456",
      publicId: "abcdef123456",
      category: "phishing",
      details: "Fake login prompt requesting credentials",
      reporterIpHash: "hash-ip-1234",
    });

    const [row] = await db.select().from(abuseReports).where(eq(abuseReports.id, reportId));
    expect(row).toBeDefined();
    expect(row.status).toBe("pending");
    expect(row.category).toBe("phishing");
    expect(row.pageUrl).toBe("https://serve.example.test/p/abcdef123456");
  });
});
