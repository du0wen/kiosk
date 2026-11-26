/** Pure pagination + empty-state helpers for the Pages list. */

/**
 * Range window for a 1-based page over `total` rows. `clampedPage` normalizes
 * an over-bounds request to the last valid page (or 1 when empty), so callers
 * never render a misleading blank over-bounds page.
 */
export function pageWindow(total: number, page: number, size = 25) {
  const pages = Math.ceil(total / size);
  const clampedPage = total === 0 ? 1 : Math.min(Math.max(page, 1), pages);
  const from = total === 0 ? 0 : (clampedPage - 1) * size + 1;
  const to = Math.min(clampedPage * size, total);
  return { from, to, pages, clampedPage };
}

/**
 * Which empty state to show: the org has never published (`first`), the current
 * filter matches nothing (`no-match`), or there are results (`null`).
 */
export function emptyState(orgTotal: number, filteredTotal: number): "first" | "no-match" | null {
  if (orgTotal === 0) return "first";
  if (filteredTotal === 0) return "no-match";
  return null;
}
