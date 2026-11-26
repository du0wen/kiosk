import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { formatBytes } from "../_lib/format";
import type { PageDetail } from "../_lib/page-detail";
import styles from "./PageDetailSummary.module.css";

/** Read-only detail fields for a page. Server component; parent passes bound
 *  translation + formatter functions (matches WorkspaceSummary/PagesTable). */
export function PageDetailSummary({ detail, shareUrl, ownerLabel, t, formatDate, formatNumber }: { detail: PageDetail; shareUrl: string; ownerLabel: string; t: (key: string) => string; formatDate: (date: Date) => string; formatNumber: (value: number) => string }) {
  const items: { label: string; value: ReactNode }[] = [
    { label: t("publicIdLabel"), value: <code>{detail.publicId}</code> },
    { label: t("shareUrl"), value: <code className={styles.url}>{shareUrl}</code> },
    { label: t("visibility"), value: <Badge tone={detail.visibility === "public" ? "success" : "neutral"}>{detail.visibility === "public" ? t("public") : t("private")}</Badge> },
    { label: t("ownerColumn"), value: ownerLabel },
    { label: t("createdAt"), value: formatDate(detail.createdAt) },
    { label: t("updatedAt"), value: formatDate(detail.updatedAt) },
    { label: t("sizeLabel"), value: formatBytes(detail.sizeBytes) },
    { label: t("totalViews"), value: formatNumber(detail.viewCount) },
    { label: t("versionCount"), value: formatNumber(detail.versionCount) },
  ];
  return (
    <dl className={styles.grid}>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
