import Link from "next/link";
import { dashboardPath } from "../../_lib/paths";
import type { RecentVersion } from "../_lib/page-detail";
import styles from "./RecentVersions.module.css";

/** The 5 most recent versions + a link to the full history page (reused). */
export function RecentVersions({ versions, publicId, t, formatDate }: { versions: RecentVersion[]; publicId: string; t: (key: string) => string; formatDate: (date: Date) => string }) {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>{t("recentVersions")}</h2>
        <Link className={styles.viewAll} href={dashboardPath.pageHistory(publicId)}>{t("viewAllVersions")}</Link>
      </div>
      <ul className={styles.list}>
        {versions.slice(0, 5).map((v) => (
          <li key={v.id}>
            <span>{formatDate(v.createdAt)}</span>
            <span className={styles.editor}>{v.editor ?? ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
