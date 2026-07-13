import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { pages, pageVersion, user, type Page } from "@/db/schema";
import { publicId } from "@/lib/id";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export class PageTooLargeError extends Error {
  constructor() {
    super("Page exceeds 2MB limit");
    this.name = "PageTooLargeError";
  }
}

/** Raw content URL on the cookieless serve origin (iframe src + embeddable). */
export function pageRawUrl(pid: string): string {
  return `${process.env.SERVE_ORIGIN}/p/${pid}`;
}

/** Branded shell URL on the app origin (the shareable link). */
export function pageShellUrl(pid: string): string {
  return `${process.env.APP_ORIGIN}/v/${pid}`;
}

/** First <title> text, trimmed and capped, else null. */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].trim().slice(0, 300);
  return t.length ? t : null;
}

function sizeOf(html: string): number {
  return Buffer.byteLength(html, "utf8");
}
function hashOf(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export async function createPage(params: {
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
  visibility?: "org" | "public";
}): Promise<Page> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const [row] = await db
    .insert(pages)
    .values({
      publicId: publicId(),
      organizationId: params.organizationId,
      createdBy: params.userId,
      title: params.title ?? extractTitle(params.html),
      contentHtml: params.html,
      sizeBytes: size,
      contentHash: hashOf(params.html),
      visibility: params.visibility ?? "org",
    })
    .returning();
  await db.insert(pageVersion).values({
    pageId: row.id,
    contentHtml: params.html,
    title: row.title,
    editedBy: params.userId,
  });
  return row;
}

export async function updatePage(params: {
  publicId: string;
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
  visibility?: "org" | "public";
}): Promise<Page | null> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const newHash = hashOf(params.html);
  const existing = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!existing) return null;
  const [row] = await db
    .update(pages)
    .set({
      contentHtml: params.html,
      sizeBytes: size,
      contentHash: newHash,
      title: params.title ?? extractTitle(params.html),
      ...(params.visibility ? { visibility: params.visibility } : {}),
      updatedBy: params.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning();
  if (row && existing.contentHash !== newHash) {
    await db.insert(pageVersion).values({
      pageId: row.id,
      contentHtml: params.html,
      title: row.title,
      editedBy: params.userId,
    });
  }
  return row ?? null;
}

export async function getPage(params: {
  publicId: string;
  organizationId: string;
}): Promise<Page | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function softDeletePage(params: {
  publicId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ deletedAt: new Date(), deletedBy: params.userId })
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning({ id: pages.id });
  return !!row;
}

export async function setPageVisibility(params: {
  publicId: string;
  organizationId: string;
  userId: string;
  visibility: "org" | "public";
}): Promise<Page | null> {
  const [row] = await db
    .update(pages)
    .set({
      visibility: params.visibility,
      updatedBy: params.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listPages(params: {
  organizationId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ items: Page[]; nextCursor: string | null }> {
  const limit = Math.min(params.limit ?? 20, 100);
  const conds = [
    eq(pages.organizationId, params.organizationId),
    isNull(pages.deletedAt),
  ];
  if (params.cursor) conds.push(lt(pages.createdAt, new Date(params.cursor)));
  const rows = await db
    .select()
    .from(pages)
    .where(and(...conds))
    .orderBy(desc(pages.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? items[items.length - 1].createdAt.toISOString()
    : null;
  return { items, nextCursor };
}

/** View-only version history for a page (newest first), with editor email. */
export async function listPageVersions(params: {
  publicId: string;
  organizationId: string;
}): Promise<{ id: string; createdAt: Date; editedByEmail: string | null }[]> {
  const page = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!page) return [];
  return db
    .select({
      id: pageVersion.id,
      createdAt: pageVersion.createdAt,
      editedByEmail: user.email,
    })
    .from(pageVersion)
    .leftJoin(user, eq(pageVersion.editedBy, user.id))
    .where(eq(pageVersion.pageId, page.id))
    .orderBy(desc(pageVersion.createdAt));
}

/** A specific version's stored HTML (org-scoped via the page), or null. */
export async function getPageVersionContent(params: {
  publicId: string;
  organizationId: string;
  versionId: string;
}): Promise<string | null> {
  const page = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!page) return null;
  const [v] = await db
    .select({ html: pageVersion.contentHtml })
    .from(pageVersion)
    .where(
      and(eq(pageVersion.id, params.versionId), eq(pageVersion.pageId, page.id)),
    )
    .limit(1);
  return v?.html ?? null;
}

/** Active page by public_id, without org scoping — for public serving. */
export async function getPublicPage(publicId: string): Promise<Page | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.publicId, publicId), isNull(pages.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Best-effort view-count bump by internal id. */
export async function incrementViewCount(id: string): Promise<void> {
  await db
    .update(pages)
    .set({ viewCount: sql`${pages.viewCount} + 1` })
    .where(eq(pages.id, id));
}

export async function renameTitle(
  publicId: string,
  organizationId: string,
  title: string,
): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(pages.publicId, publicId),
        eq(pages.organizationId, organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning({ id: pages.id });
  return !!row;
}
