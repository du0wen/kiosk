"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { DASHBOARD_NAVIGATION, isNavigationActive } from "../_config/navigation";
import { BrandLogo, IconButton } from "@/components/ui";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { LocaleMenu } from "./LocaleMenu";
import { AccountMenu } from "./AccountMenu";
import styles from "./Sidebar.module.css";

export function Sidebar({ activeOrganizationId, organizationName, userName, userEmail, open, onNavigate, onClose }: { activeOrganizationId: string; organizationName: string; userName: string; userEmail: string; open: boolean; onNavigate: () => void; onClose: () => void }) {
  const pathname = usePathname(); const nav = useTranslations("nav"); const shell = useTranslations("shell");
  return <aside className={[styles.sidebar, open && styles.open].filter(Boolean).join(" ")}><div className={styles.brandRow}><Link href="/pages" className={styles.brand} onClick={onNavigate}><span className={styles.mark}><BrandLogo size={26} /></span><span>Kiosk</span></Link><IconButton className={styles.close} label={shell("closeMenu")} icon={<X size={18} />} onClick={onClose} /></div><OrganizationSwitcher key={activeOrganizationId} activeOrganizationId={activeOrganizationId} organizationName={organizationName} resetSignal={open} /><nav className={styles.navigation} aria-label="Kiosk">{DASHBOARD_NAVIGATION.map(({ href, labelKey, icon: Icon }) => <Link key={href} href={href} onClick={onNavigate} className={[styles.navItem, isNavigationActive(pathname, href) && styles.active].filter(Boolean).join(" ")}><Icon size={17} aria-hidden="true" /><span>{nav(labelKey)}</span></Link>)}</nav><div className={styles.footer}><LocaleMenu resetSignal={open} /><AccountMenu userName={userName} userEmail={userEmail} resetSignal={open} /></div></aside>;
}
