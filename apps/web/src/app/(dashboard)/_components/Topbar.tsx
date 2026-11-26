"use client";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui";
import styles from "./Topbar.module.css";

// Search now lives in each page's own toolbar, so the desktop topbar has no
// content and collapses to a zero-height row (see CSS + DashboardShell grid).
// It remains on mobile purely to launch the navigation drawer.
export function Topbar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const t = useTranslations("shell");
  return (
    <header className={styles.topbar}>
      <IconButton className={styles.menu} label={t("openMenu")} icon={<Menu size={19} />} onClick={onOpenNavigation} />
    </header>
  );
}
