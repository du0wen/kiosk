import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { Button, TextAreaField, TextField } from "@/components/ui";
import { ProtectionStoreError } from "@/lib/protection/errors";
import { enforceRequestLimit } from "@/lib/protection/guard";
import { RateLimitExceededError } from "@/lib/protection/limiter";
import { submitAbuseReport } from "@/lib/abuse";
import styles from "./page.module.css";

function reportPageKey(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "unknown";
  const match = value.match(/\/p\/([A-Za-z0-9_-]{1,64})(?:[/?#]|$)/);
  return match?.[1] ?? "unknown";
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    url?: string;
    sent?: string;
    error?: "rate_limited" | "protection_unavailable";
  }>;
}) {
  const t = await getTranslations("report");
  const { id, url, sent, error } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    try {
      const requestHeaders = await headers();
      await enforceRequestLimit(
        new Request("http://localhost/report", { headers: requestHeaders }),
        "report",
        "report",
        [reportPageKey(formData.get("url"))],
      );

      const reportedUrl = typeof formData.get("url") === "string" ? String(formData.get("url")) : "";
      const reportedReason = typeof formData.get("reason") === "string" ? String(formData.get("reason")) : "";
      const clientIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || undefined;

      if (reportedUrl && reportedReason) {
        await submitAbuseReport({
          pageUrl: reportedUrl,
          reason: reportedReason,
          reporterIp: clientIp,
        });
      }
    } catch (cause) {
      if (cause instanceof RateLimitExceededError) {
        redirect("/report?error=rate_limited");
      }
      if (cause instanceof ProtectionStoreError) {
        redirect("/report?error=protection_unavailable");
      }
      throw cause;
    }
    redirect("/report?sent=1");
  }

  return (
    <main className={styles.canvas}><section className={styles.panel}>
      <div className={styles.heading}><span><AlertTriangle size={20} /></span><div><h1>{t("title")}</h1><p>{t("description")}</p></div></div>
      {sent ? (
        <div className={styles.success}><span><Check size={20} /></span><p>{t("thanks")}</p></div>
      ) : (
        <form action={submit} className={styles.form}>
          {error ? <p className={styles.error} role="alert">{t(error)}</p> : null}
          <TextField
            name="url"
            label={t("url")}
            defaultValue={url ?? (id ? `/p/${id}` : "")}
            required
          />
          <TextAreaField name="reason" label={t("reason")} required />
          <Button variant="primary" type="submit">{t("submit")}</Button>
        </form>
      )}
    </section></main>
  );
}
