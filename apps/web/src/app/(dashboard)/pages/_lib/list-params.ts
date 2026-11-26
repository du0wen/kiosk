/**
 * Whitelist parser + href builder for the Pages list URL params
 * (`/pages?q=&visibility=&owner=&sort=&page=`). Every value is validated and
 * falls back to a default; nothing here is ever concatenated into SQL — the
 * query layer binds these as parameters. Pure, so it is unit-tested directly.
 */
export const PAGE_SIZE = 25;

export type Visibility = "all" | "public" | "org";
export type Sort = "updated_desc" | "updated_asc" | "views_desc" | "title_asc";
export type PageListParams = { q: string; visibility: Visibility; owner: string; sort: Sort; page: number };

const VISIBILITIES = new Set<Visibility>(["all", "public", "org"]);
const SORTS = new Set<Sort>(["updated_desc", "updated_asc", "views_desc", "title_asc"]);

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

export function parsePageListParams(raw: Record<string, string | string[] | undefined>): PageListParams {
  const q = first(raw.q).trim();
  const v = first(raw.visibility);
  const visibility = (VISIBILITIES.has(v as Visibility) ? v : "all") as Visibility;
  const o = first(raw.owner);
  const owner = o === "me" ? "me" : o !== "all" && /^[\w-]{1,64}$/.test(o) ? o : "all";
  const s = first(raw.sort);
  const sort = (SORTS.has(s as Sort) ? s : "updated_desc") as Sort;
  const n = Number.parseInt(first(raw.page), 10);
  const page = Number.isFinite(n) && n >= 1 ? n : 1;
  return { q, visibility, owner, sort, page };
}

/**
 * The current user's own id collapses to the canonical `me` param, so the Owner
 * filter never shows both `Me` and the same person by id. Any other value
 * (`me`, `all`, another owner's id) is returned unchanged.
 */
export function canonicalizeOwner(owner: string, currentUserId: string): string {
  return owner === currentUserId ? "me" : owner;
}

export function pagesHref(p: Partial<PageListParams>): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.visibility && p.visibility !== "all") sp.set("visibility", p.visibility);
  if (p.owner && p.owner !== "all") sp.set("owner", p.owner);
  if (p.sort && p.sort !== "updated_desc") sp.set("sort", p.sort);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/pages?${qs}` : "/pages";
}
