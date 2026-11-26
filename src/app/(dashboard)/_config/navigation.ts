import type { LucideIcon } from "lucide-react";
import { FileText, Settings, Users } from "lucide-react";

export type DashboardNavItem = {
  href: "/pages" | "/members" | "/settings";
  labelKey: "pages" | "members" | "settings";
  icon: LucideIcon;
};

export const DASHBOARD_NAVIGATION: readonly DashboardNavItem[] = [
  { href: "/pages", labelKey: "pages", icon: FileText },
  { href: "/members", labelKey: "members", icon: Users },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export function isNavigationActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
