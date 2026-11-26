import type { PagesSummary } from "../_lib/rows";
import styles from "./WorkspaceSummary.module.css";

const METRICS: { key: string; field: keyof PagesSummary }[] = [
  { key: "summaryTotal", field: "total" },
  { key: "summaryPublic", field: "publicCount" },
  { key: "summaryOrg", field: "orgCount" },
  { key: "summaryViews", field: "totalViews" },
];

/**
 * Compact, scannable workspace overview shown above the pages table. Inline
 * label/value pairs — deliberately not KPI cards — using existing tokens.
 */
export function WorkspaceSummary({
  summary,
  t,
  formatNumber,
}: {
  summary: PagesSummary;
  t: (key: string) => string;
  formatNumber: (value: number) => string;
}) {
  return (
    <dl className={styles.summary}>
      {METRICS.map((metric) => (
        <div key={metric.key} className={styles.item}>
          <dt className={styles.label}>{t(metric.key)}</dt>
          <dd className={styles.value}>{formatNumber(summary[metric.field])}</dd>
        </div>
      ))}
    </dl>
  );
}
