import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { abuseReports, pages, type AbuseReport } from "@/db/schema";
import { uuidv7 } from "@/lib/id";

export function extractPublicIdFromUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:\/p\/|\/v\/|^)([A-Za-z0-9_-]{1,64})(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

export function hashReporterIp(ip: string | undefined): string | null {
  if (!ip || !ip.trim()) return null;
  return createHash("sha256").update(ip.trim()).digest("hex");
}

export async function submitAbuseReport(params: {
  pageUrl: string;
  reason: string;
  reporterIp?: string;
  category?: string;
}): Promise<AbuseReport> {
  const pubId = extractPublicIdFromUrl(params.pageUrl);
  let linkedPageId: string | null = null;

  if (pubId) {
    const [pageRow] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.publicId, pubId), isNull(pages.deletedAt)))
      .limit(1);
    if (pageRow) {
      linkedPageId = pageRow.id;
    }
  }

  const id = uuidv7();
  const [created] = await db
    .insert(abuseReports)
    .values({
      id,
      pageId: linkedPageId,
      publicId: pubId,
      pageUrl: params.pageUrl.trim(),
      category: params.category ?? "phishing",
      details: params.reason.trim(),
      reporterIpHash: hashReporterIp(params.reporterIp),
      status: "pending",
    })
    .returning();

  return created;
}
