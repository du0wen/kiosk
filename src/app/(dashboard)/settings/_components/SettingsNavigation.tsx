"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import styles from "./SettingsNavigation.module.css";
import { usePlatformAdmin } from "../../_components/PlatformAdminContext";

// Real routes — one page per item. Active state is derived from the pathname
// (exact match), so exactly one item is ever current. No hash navigation.
const ITEMS: {
  labelKey: "general" | "branding" | "templates" | "apiTokens" | "audit";
  href: Route;
}[] = [
  { labelKey: "general", href: "/settings" as Route },
  { labelKey: "branding", href: "/settings/branding" as Route },
  { labelKey: "templates", href: "/settings/templates" as Route },
  { labelKey: "apiTokens", href: "/settings/api-tokens" as Route },
  { labelKey: "audit", href: "/settings/audit" as Route },
];

export function SettingsNavigation() {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const platformAdmin = usePlatformAdmin();
  const items = platformAdmin
    ? [...ITEMS, { labelKey: "storage" as const, href: "/settings/storage" as Route }]
    : ITEMS;
  return (
    <nav className={styles.nav} aria-label={t("title")}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[styles.item, active && styles.active].filter(Boolean).join(" ")}
            aria-current={active ? "page" : undefined}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
