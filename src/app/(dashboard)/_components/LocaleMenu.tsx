"use client";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/i18n/locale";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import { SidebarDropdown } from "./SidebarDropdown";
import styles from "./SidebarControl.module.css";
export function LocaleMenu({ resetSignal }: { resetSignal?: boolean }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = locales.map((code) => ({
    value: code,
    label: localeLabels[code],
  }));
  return <SidebarDropdown
    label={t("language")}
    value={locale}
    options={options}
    disabled={pending}
    busy={pending}
    placement="top"
    triggerClassName={styles.control}
    resetSignal={resetSignal}
    onChange={(value) => startTransition(async () => { await setLocaleAction(value as Locale); router.refresh(); })}
  >
    <Languages size={17} aria-hidden="true" />
    <span>{t("language")}</span>
  </SidebarDropdown>;
}
