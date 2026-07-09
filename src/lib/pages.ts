import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { pages, type Page } from "@/db/schema";
import { publicId } from "@/lib/id";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export class PageTooLargeError extends Error {
  constructor() {
    super("Page exceeds 2MB limit");
    this.name = "PageTooLargeError";
  }
}

export function pageUrl(pid: string): string {
  return `${process.env.SERVE_ORIGIN}/p/${pid}`;
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
    })
    .returning();
  return row;
}

export async function updatePage(params: {
  publicId: string;
  organizationId: string;
  html: string;
  title?: string | null;
}): Promise<Page | null> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const [row] = await db
    .update(pages)
    .set({
      contentHtml: params.html,
      sizeBytes: size,
      contentHash: hashOf(params.html),
      title: params.title ?? extractTitle(params.html),
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
}): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ deletedAt: new Date() })
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
