import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "../../_components/PageHeader";
import { SettingsNavigation } from "./SettingsNavigation";
import styles from "./SettingsLayout.module.css";

// Shared chrome for all Settings routes: page header, the real-route tab nav
// (active derived from the pathname), and a width-capped content container.
export async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <div className={styles.container}>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SettingsNavigation />
      {children}
    </div>
  );
}
