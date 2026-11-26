import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
import { AUDIT_ACTIONS, listOrgAuditLogs } from "@/lib/audit";
import { Badge } from "@/components/ui";
import { PageSection } from "../../_components/PageHeader";
import { SettingsLayout } from "../_components/SettingsLayout";

export default async function AuditSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/audit");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const { action } = await searchParams;
  const t = await getTranslations("audit");

  const logs = await listOrgAuditLogs({
    organizationId: org,
    action: action ?? null,
    limit: 100,
  });

  return (
    <SettingsLayout>
      <PageSection title={t("title")} description={t("subtitle")}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <Link href="/settings/audit">
              <Badge tone={!action ? "success" : "neutral"}>{t("allActions")}</Badge>
            </Link>
            {AUDIT_ACTIONS.map((act) => (
              <Link key={act} href={`/settings/audit?action=${encodeURIComponent(act)}`}>
                <Badge tone={action === act ? "success" : "neutral"}>{act}</Badge>
              </Link>
            ))}
          </div>

          {logs.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              {t("empty")}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-default)", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem 0.75rem" }}>{t("colTime")}</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>{t("colActor")}</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>{t("colAction")}</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>{t("colTarget")}</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>{t("colSummary")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr
                      key={row.id}
                      style={{ borderBottom: "1px solid var(--border-default)" }}
                    >
                      <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                        {row.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        {row.actorEmail ?? row.actorUserId ?? "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        <code>{row.action}</code>
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        {row.targetId ? <code>{row.targetId}</code> : "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)" }}>
                        {row.summary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageSection>
    </SettingsLayout>
  );
}
