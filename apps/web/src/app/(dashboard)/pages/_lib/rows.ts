import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, user } from "@/db/schema";
import { PAGE_SIZE, type PageListParams } from "./list-params";

export function pageOwnerLabel(name: string | null, email: string | null, fallback: string): string {
  return name || email || fallback;
}

/**
 * Build the Owner filter's `<option>`s from the distinct page owners, dropping
 * the current user — their pages are already reachable via the canonical `Me`
 * option, so listing them by name too would be a duplicate. Other owners keep
 * their real name / email label.
 */
export function ownerOptions(
  owners: { id: string; name: string | null; email: string | null }[],
  currentUserId: string,
  fallback: string,
): { id: string; label: string }[] {
  return owners
    .filter((o) => o.id !== currentUserId)
    .map((o) => ({ id: o.id, label: pageOwnerLabel(o.name, o.email, fallback) }));
}

export type PagesSummary = { total: number; publicCount: number; orgCount: number; totalViews: number };

/**
 * Coerce the aggregate row (Postgres returns count/sum as strings or null) into
 * numbers and derive the organization-only count from total − public.
 */
export function normalizePagesSummary(raw: {
  total: unknown;
  publicCount: unknown;
  totalViews: unknown;
}): PagesSummary {
  const total = Number(raw.total ?? 0);
  const publicCount = Number(raw.publicCount ?? 0);
  return { total, publicCount, orgCount: total - publicCount, totalViews: Number(raw.totalViews ?? 0) };
}

/**
 * Whole-workspace totals for the pages header summary — independent of the
 * search filter and the list's 100-row cap. Read-only; no write-path change.
 */
export async function getPagesSummary(organizationId: string): Promise<PagesSummary> {
  const [raw] = await db
    .select({
      total: sql<string>`count(*)`,
      publicCount: sql<string>`count(*) filter (where ${pages.visibility} = 'public')`,
      totalViews: sql<string>`coalesce(sum(${pages.viewCount}), 0)`,
    })
    .from(pages)
    .where(and(eq(pages.organizationId, organizationId), isNull(pages.deletedAt)));
  return normalizePagesSummary(raw ?? { total: 0, publicCount: 0, totalViews: 0 });
}

// (The old unfiltered listConsolePages was replaced by queryConsolePages.)

// Escape LIKE metacharacters so a user's `q` can't act as a wildcard.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function pagesWhere(organizationId: string, p: PageListParams, userId: string) {
  const conds = [eq(pages.organizationId, organizationId), isNull(pages.deletedAt)];
  if (p.visibility !== "all") conds.push(eq(pages.visibility, p.visibility));
  if (p.owner === "me") conds.push(eq(pages.createdBy, userId));
  else if (p.owner !== "all") conds.push(eq(pages.createdBy, p.owner));
  if (p.q) {
    const like = `%${escapeLike(p.q)}%`;
    conds.push(or(ilike(pages.title, like), ilike(pages.publicId, like))!);
  }
  return and(...conds);
}

const PAGE_ORDER = {
  updated_desc: [desc(pages.updatedAt)],
  updated_asc: [asc(pages.updatedAt)],
  views_desc: [desc(pages.viewCount)],
  title_asc: [asc(sql`coalesce(${pages.title}, ${pages.publicId})`)],
} as const;

/**
 * DB-side filtered/sorted/paginated console list + full match count. Selects a
 * projection only (never content_html); a stable id tiebreaker keeps paging
 * deterministic. Callers pass whitelisted params (see list-params.ts).
 */
export async function queryConsolePages(organizationId: string, p: PageListParams, userId: string) {
  const where = pagesWhere(organizationId, p, userId);
  const items = await db
    .select({ publicId: pages.publicId, title: pages.title, visibility: pages.visibility, viewCount: pages.viewCount, updatedAt: pages.updatedAt, createdBy: pages.createdBy, ownerName: user.name, ownerEmail: user.email })
    .from(pages)
    .leftJoin(user, eq(pages.createdBy, user.id))
    .where(where)
    .orderBy(...PAGE_ORDER[p.sort], desc(pages.id))
    .limit(PAGE_SIZE)
    .offset((p.page - 1) * PAGE_SIZE);
  const [{ total }] = await db.select({ total: sql<string>`count(*)` }).from(pages).where(where);
  return { items, total: Number(total ?? 0) };
}

/** Distinct owners of the org's active pages, for the Owner filter select. */
export async function listPageOwners(organizationId: string) {
  return db
    .selectDistinct({ id: pages.createdBy, name: user.name, email: user.email })
    .from(pages)
    .leftJoin(user, eq(pages.createdBy, user.id))
    .where(and(eq(pages.organizationId, organizationId), isNull(pages.deletedAt)));
}
