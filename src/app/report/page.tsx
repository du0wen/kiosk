import { getTranslations } from "next-intl/server";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; sent?: string }>;
}) {
  const t = await getTranslations("report");
  const { id, sent } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    // MVP: log the report; a triage queue/table is a follow-up.
    console.warn("ABUSE REPORT", {
      url: formData.get("url"),
      reason: formData.get("reason"),
    });
    const { redirect } = await import("next/navigation");
    redirect("/report?sent=1");
  }

  return (
    <main
      style={{ maxWidth: 520, margin: "8vh auto", padding: 16, display: "grid", gap: 12 }}
    >
      <h1>{t("title")}</h1>
      {sent ? (
        <p>{t("thanks")}</p>
      ) : (
        <form action={submit} style={{ display: "grid", gap: 8 }}>
          <input
            name="url"
            placeholder={t("url")}
            defaultValue={id ? `/p/${id}` : ""}
            required
          />
          <textarea name="reason" placeholder={t("reason")} required />
          <button type="submit">{t("submit")}</button>
        </form>
      )}
    </main>
  );
}
