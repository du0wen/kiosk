import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, pageVersion, user } from "@/db/schema";

export type RecentVersion = { id: string; createdAt: Date; editor: string | null };
export type PageDetail = {
  publicId: string;
  title: string | null;
  visibility: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  sizeBytes: number;
  viewCount: number;
  versionCount: number;
  recentVersions: RecentVersion[];
};

/**
 * Org-scoped page detail for the console. Explicitly projects the fields the
 * detail view needs — never `content_html` (that must not reach the client) —
 * plus an aggregate version count and the 5 most recent versions. Returns null
 * when the page isn't in the org (cross-org isolation → 404 at the route).
 * Fixed 3 queries, no N+1.
 */
export async function getConsolePageDetail(organizationId: string, pid: string): Promise<PageDetail | null> {
  const [row] = await db
    .select({
      id: pages.id,
      publicId: pages.publicId,
      title: pages.title,
      visibility: pages.visibility,
      createdBy: pages.createdBy,
      ownerName: user.name,
      ownerEmail: user.email,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      sizeBytes: pages.sizeBytes,
      viewCount: pages.viewCount,
    })
    .from(pages)
    .leftJoin(user, eq(pages.createdBy, user.id))
    .where(and(eq(pages.publicId, pid), eq(pages.organizationId, organizationId), isNull(pages.deletedAt)))
    .limit(1);
  if (!row) return null;

  const [{ count }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(pageVersion)
    .where(eq(pageVersion.pageId, row.id));

  const recentVersions = await db
    .select({ id: pageVersion.id, createdAt: pageVersion.createdAt, editor: user.email })
    .from(pageVersion)
    .leftJoin(user, eq(pageVersion.editedBy, user.id))
    .where(eq(pageVersion.pageId, row.id))
    .orderBy(desc(pageVersion.createdAt))
    .limit(5);

  // Explicit projection — the internal uuid `id` is used only for the queries
  // above and is deliberately not returned to the client.
  return {
    publicId: row.publicId,
    title: row.title,
    visibility: row.visibility,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sizeBytes: row.sizeBytes,
    viewCount: row.viewCount,
    versionCount: Number(count ?? 0),
    recentVersions,
  };
}
