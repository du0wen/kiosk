import Link from "next/link";
import type { Route } from "next";
import { pagesHref, type PageListParams } from "../_lib/list-params";
import { pageWindow } from "../_lib/pagination";
import styles from "./Pagination.module.css";

/**
 * Range + Previous/Next for the pages list. Server component; the parent passes
 * a bound `t`. Renders nothing with no results; Prev/Next become disabled
 * spans (not links) at the bounds and otherwise carry the active filters.
 */
export function Pagination({ params, total, t }: { params: PageListParams; total: number; t: (key: string, values?: Record<string, string | number>) => string }) {
  if (total === 0) return null;
  const { from, to, pages, clampedPage } = pageWindow(total, params.page);
  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < pages;
  const disabled = [styles.button, styles.disabled].join(" ");
  return (
    <nav className={styles.pagination} aria-label={t("paginationLabel")}>
      <span className={styles.range}>{t("paginationRange", { from, to, total })}</span>
      <div className={styles.controls}>
        {hasPrev ? (
          <Link className={styles.button} href={pagesHref({ ...params, page: clampedPage - 1 }) as Route}>{t("previous")}</Link>
        ) : (
          <span className={disabled} aria-disabled="true">{t("previous")}</span>
        )}
        <span className={styles.pageOf}>{t("paginationPageOf", { page: clampedPage, pages })}</span>
        {hasNext ? (
          <Link className={styles.button} href={pagesHref({ ...params, page: clampedPage + 1 }) as Route}>{t("next")}</Link>
        ) : (
          <span className={disabled} aria-disabled="true">{t("next")}</span>
        )}
      </div>
    </nav>
  );
}
