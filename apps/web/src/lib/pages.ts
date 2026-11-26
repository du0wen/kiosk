import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { pageContent, pages, pageVersion, user, type Page } from "@/db/schema";
import { publicId } from "@/lib/id";
import {
  assertPageCreateQuota,
  assertPageVersionQuota,
  lockOrganizationQuota,
} from "@/lib/quota";
import type { ProtectionPolicy } from "@/lib/protection/policy";
import {
  contentRepository as defaultContentRepository,
  type ContentRepository,
  type PreparedExternalContent,
} from "@/lib/storage/content-repository";

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

type ContentTransaction = Pick<typeof db, "insert" | "select">;

async function ensureExternalContent(
  tx: ContentTransaction,
  organizationId: string,
  external: PreparedExternalContent | null,
): Promise<string | null> {
  if (!external) return null;
  const [inserted] = await tx
    .insert(pageContent)
    .values({
      organizationId,
      storageProfileId: external.storageProfileId,
      objectKey: external.objectKey,
      contentHash: external.contentHash,
      sizeBytes: external.sizeBytes,
    })
    .onConflictDoNothing()
    .returning({ id: pageContent.id });
  if (inserted) return inserted.id;
  const [existing] = await tx
    .select({ id: pageContent.id })
    .from(pageContent)
    .where(
      and(
        eq(pageContent.organizationId, organizationId),
        eq(pageContent.storageProfileId, external.storageProfileId),
        eq(pageContent.contentHash, external.contentHash),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Uploaded content metadata is unavailable");
  return existing.id;
}

export async function createPage(params: {
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
  visibility?: "org" | "public";
}, dependencies: {
  contentRepository?: Pick<ContentRepository, "write">;
  quotaPolicy?: Readonly<ProtectionPolicy>;
} = {}): Promise<Page> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  return (dependencies.contentRepository ?? defaultContentRepository).write(
    { organizationId: params.organizationId, html: params.html },
    (prepared) =>
      db.transaction(async (tx) => {
        await assertPageCreateQuota(
          tx,
          params.organizationId,
          size,
          dependencies.quotaPolicy,
        );
        const contentId = await ensureExternalContent(tx, params.organizationId, prepared.external);
        const [row] = await tx
          .insert(pages)
          .values({
            publicId: publicId(),
            organizationId: params.organizationId,
            createdBy: params.userId,
            title: params.title ?? extractTitle(params.html),
            contentHtml: prepared.legacyHtml,
            currentContentId: contentId,
            sizeBytes: size,
            contentHash: hashOf(params.html),
            visibility: params.visibility ?? "org",
          })
          .returning();
        await tx.insert(pageVersion).values({
          pageId: row.id,
          contentHtml: prepared.legacyHtml,
          contentId,
          title: row.title,
          editedBy: params.userId,
        });
        return row;
      }),
  );
}

export async function updatePage(params: {
  publicId: string;
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
  visibility?: "org" | "public";
}, dependencies: {
  contentRepository?: Pick<ContentRepository, "write">;
  quotaPolicy?: Readonly<ProtectionPolicy>;
} = {}): Promise<Page | null> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const newHash = hashOf(params.html);
  const existing = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!existing) return null;
  return (dependencies.contentRepository ?? defaultContentRepository).write(
    { organizationId: params.organizationId, html: params.html },
    (prepared) =>
      db.transaction(async (tx) => {
        await lockOrganizationQuota(params.organizationId, tx);
        const [lockedExisting] = await tx
          .select({ id: pages.id, contentHash: pages.contentHash })
          .from(pages)
          .where(
            and(
              eq(pages.publicId, params.publicId),
              eq(pages.organizationId, params.organizationId),
              isNull(pages.deletedAt),
            ),
          )
          .limit(1);
        if (!lockedExisting) return null;
        const contentChanged = lockedExisting.contentHash !== newHash;
        await assertPageVersionQuota(
          tx,
          params.organizationId,
          contentChanged ? size : 0,
          dependencies.quotaPolicy,
        );
        const contentId = await ensureExternalContent(tx, params.organizationId, prepared.external);
        const [row] = await tx
          .update(pages)
          .set({
            contentHtml: prepared.legacyHtml,
            currentContentId: contentId,
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
        if (row && contentChanged) {
          await tx.insert(pageVersion).values({
            pageId: row.id,
            contentHtml: prepared.legacyHtml,
            contentId,
            title: row.title,
            editedBy: params.userId,
          });
        }
        return row ?? null;
      }),
  );
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

export async function getPageContent(page: Page): Promise<string> {
  return defaultContentRepository.read({
    organizationId: page.organizationId,
    contentId: page.currentContentId,
    legacyHtml: page.contentHtml,
  });
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
    .select({ html: pageVersion.contentHtml, contentId: pageVersion.contentId })
    .from(pageVersion)
    .where(
      and(eq(pageVersion.id, params.versionId), eq(pageVersion.pageId, page.id)),
    )
    .limit(1);
  if (!v) return null;
  return defaultContentRepository.read({
    organizationId: params.organizationId,
    contentId: v.contentId,
    legacyHtml: v.html,
  });
}

/** Active page by public_id, without org scoping — for public serving. Excludes soft-deleted and blocked pages. */
export async function getPublicPage(publicId: string): Promise<Page | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.publicId, publicId),
        isNull(pages.deletedAt),
        isNull(pages.blockedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Takedown/block a page by publicId (sets blocked_at timestamp and reason). */
export async function blockPage(params: {
  publicId: string;
  reason?: string;
}): Promise<boolean> {
  const [updated] = await db
    .update(pages)
    .set({
      blockedAt: new Date(),
      blockedReason: params.reason ?? null,
    })
    .where(and(eq(pages.publicId, params.publicId), isNull(pages.deletedAt)))
    .returning({ id: pages.id });
  return !!updated;
}

/** Unblock a previously blocked page. */
export async function unblockPage(publicId: string): Promise<boolean> {
  const [updated] = await db
    .update(pages)
    .set({
      blockedAt: null,
      blockedReason: null,
    })
    .where(and(eq(pages.publicId, publicId), isNull(pages.deletedAt)))
    .returning({ id: pages.id });
  return !!updated;
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
