"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PlatformAdminProvider } from "./PlatformAdminContext";
import styles from "./DashboardShell.module.css";

export function DashboardShell({ activeOrganizationId, organizationName, userName, userEmail, platformAdmin, children }: { activeOrganizationId: string; organizationName: string; userName: string; userEmail: string; platformAdmin: boolean; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = useTranslations("shell");
  return <PlatformAdminProvider value={platformAdmin}><div className={styles.shell}><Sidebar activeOrganizationId={activeOrganizationId} organizationName={organizationName} userName={userName} userEmail={userEmail} open={drawerOpen} onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />{drawerOpen && <button className={styles.scrim} aria-label={t("closeMenu")} onClick={() => setDrawerOpen(false)} />}<div className={styles.workspace}><Topbar onOpenNavigation={() => setDrawerOpen(true)} /><main className={styles.content}>{children}</main><footer className={styles.footer}><span className={styles.statusDot} aria-hidden="true" />{t("systemStatus")}: {t("operational")}</footer></div></div></PlatformAdminProvider>;
}
