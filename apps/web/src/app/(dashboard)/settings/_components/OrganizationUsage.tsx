import { getLocale, getTranslations } from "next-intl/server";
import { Progress } from "@/components/ui";
import type { OrganizationUsage as Usage } from "@/lib/quota";
import type { ProtectionPolicy } from "@/lib/protection/policy";
import styles from "./OrganizationUsage.module.css";

export async function OrganizationUsage({
  usage,
  quotas,
}: {
  usage: Usage;
  quotas: Readonly<ProtectionPolicy>["quotas"];
}) {
  const t = await getTranslations("settings");
  const locale = await getLocale();
  const number = new Intl.NumberFormat(locale);
  const bytes = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  });
  const items = [
    { key: "activePages", value: usage.activePages, limit: quotas.activePages },
    { key: "retainedBytes", value: usage.retainedBytes, limit: quotas.retainedBytes },
    { key: "activeTokens", value: usage.activeTokens, limit: quotas.activeTokens },
    { key: "members", value: usage.members, limit: quotas.members },
    { key: "invitations", value: usage.invitations, limit: quotas.invitations },
  ] as const;

  return (
    <div className={styles.grid}>
      {items.map((item) => {
        const value = item.key === "retainedBytes" ? item.value / 1_000_000 : item.value;
        const limit = item.key === "retainedBytes" ? item.limit / 1_000_000 : item.limit;
        const display = item.key === "retainedBytes"
          ? `${bytes.format(value)} / ${bytes.format(limit)}`
          : `${number.format(value)} / ${number.format(limit)}`;
        return (
          <div className={styles.item} key={item.key}>
            <div><strong>{t(`usage_${item.key}`)}</strong><span>{display}</span></div>
            <Progress value={item.value} max={item.limit} label={t(`usage_${item.key}`)} />
          </div>
        );
      })}
    </div>
  );
}
