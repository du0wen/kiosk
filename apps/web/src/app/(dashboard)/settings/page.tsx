import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { member, organization, user } from "@/db/schema";
import { getSession } from "@/lib/session";
import { isAdminEmail, resolveActiveOrg, roleInOrg } from "@/lib/console";
import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { getOrgBranding, getOrgSettings, setOrgSettings } from "@/lib/org-settings";
import { recordOrgAuditEvent } from "@/lib/audit";
import { isPublicSignupAllowed } from "@/lib/setup/config-file";
import { PageSection } from "../_components/PageHeader";
import { SettingsLayout } from "./_components/SettingsLayout";
import { GeneralForm, type GeneralState } from "./_components/GeneralForm";
import { OrgSecurityForm } from "./_components/OrgSecurityForm";
import { OrgDangerZone } from "./_components/OrgDangerZone";
import { SignupPolicyForm } from "./_components/SignupPolicyForm";
import { validateOrgName } from "./_lib/org-name";
import { OrganizationUsage } from "./_components/OrganizationUsage";
import { getOrganizationUsage } from "@/lib/quota";
import { getProtectionRuntime } from "@/lib/protection/runtime";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);
  const canEdit = !!role && can(role, "org.update");
  const isOwner = role === "owner";
  const branding = await getOrgBranding(org);
  const orgSettingsView = await getOrgSettings(org);
  const usage = await getOrganizationUsage(org);
  const quotas = getProtectionRuntime().policy.quotas;
  const t = await getTranslations("settings");

  const adminRows = isOwner
    ? await db
        .select({
          userId: member.userId,
          email: user.email,
          name: user.name,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(
          and(
            eq(member.organizationId, org),
            eq(member.role, "admin"),
            ne(member.userId, session.user.id),
          ),
        )
    : [];

  async function updateName(_prev: GeneralState, formData: FormData): Promise<GeneralState> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false, error: "failed" };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false, error: "failed" };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false, error: "forbidden" };
    const parsed = validateOrgName(String(formData.get("name") ?? ""));
    if (!parsed.ok) return { ok: false, error: "invalid" };
    try {
      await auth.api.updateOrganization({
        body: { organizationId: o, data: { name: parsed.name } },
        headers: await headers(),
      });
    } catch {
      return { ok: false, error: "failed" };
    }
    revalidatePath("/settings");
    return { ok: true };
  }

  async function updateOrgSecurity(input: {
    allowPublicPages: boolean;
    allowMemberExport: boolean;
  }): Promise<{ ok: boolean }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false };
    try {
      await setOrgSettings(o, {
        allowPublicPages: input.allowPublicPages,
        allowMemberExport: input.allowMemberExport,
      });
      await recordOrgAuditEvent({
        organizationId: o,
        actorUserId: s.user.id,
        actorEmail: s.user.email,
        action: "org.security",
        targetType: "org",
        targetId: o,
        summary: `allowPublicPages=${input.allowPublicPages}, allowMemberExport=${input.allowMemberExport}`,
      });
      revalidatePath("/settings");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async function transferOwnership(targetUserId: string): Promise<{ ok: boolean }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (r !== "owner" || targetUserId === s.user.id) return { ok: false };

    const [targetMember] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, o), eq(member.userId, targetUserId)))
      .limit(1);
    if (!targetMember || targetMember.role !== "admin") return { ok: false };

    await db.transaction(async (tx) => {
      await tx
        .update(member)
        .set({ role: "owner" })
        .where(and(eq(member.organizationId, o), eq(member.userId, targetUserId)));
      await tx
        .update(member)
        .set({ role: "admin" })
        .where(and(eq(member.organizationId, o), eq(member.userId, s.user.id)));
    });
    await recordOrgAuditEvent({
      organizationId: o,
      actorUserId: s.user.id,
      actorEmail: s.user.email,
      action: "org.transfer",
      targetType: "member",
      targetId: targetUserId,
      summary: "Transferred organization ownership",
    });
    revalidatePath("/settings");
    revalidatePath("/members");
    return { ok: true };
  }

  async function deleteOrganizationAction(
    confirmName: string,
  ): Promise<{ ok: boolean; reason?: "mismatch" | "last_org" }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (r !== "owner") return { ok: false };

    const currentBrand = await getOrgBranding(o);
    if (confirmName.trim() !== (currentBrand.name ?? "")) {
      return { ok: false, reason: "mismatch" };
    }

    const memberships = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, s.user.id));
    if (memberships.length <= 1) {
      return { ok: false, reason: "last_org" };
    }

    await db.delete(organization).where(eq(organization.id, o));
    revalidatePath("/pages");
    revalidatePath("/settings");
    return { ok: true };
  }

  return (
    <SettingsLayout>
      <PageSection title={t("general")} description={t("generalDescription")}>
        <GeneralForm
          key={org}
          organizationId={org}
          organizationName={branding.name ?? "Kiosk"}
          role={role ?? "member"}
          canEdit={canEdit}
          action={updateName}
        />
      </PageSection>
      <PageSection title={t("orgSecurity")} description={t("orgSecurityDescription")}>
        <OrgSecurityForm
          key={`${org}-security`}
          initialAllowPublicPages={orgSettingsView.allowPublicPages}
          initialAllowMemberExport={orgSettingsView.allowMemberExport}
          canEdit={canEdit}
          onSave={updateOrgSecurity}
        />
      </PageSection>
      <PageSection title={t("usage")} description={t("usageDescription")}>
        <OrganizationUsage usage={usage} quotas={quotas} />
      </PageSection>
      {isOwner && (
        <PageSection title={t("dangerZone")} description={t("dangerZoneDescription")}>
          <OrgDangerZone
            key={`${org}-danger`}
            organizationName={branding.name ?? "Kiosk"}
            adminCandidates={adminRows.map((row) => ({
              userId: row.userId,
              label: row.name ? `${row.name} (${row.email})` : row.email,
            }))}
            onTransfer={transferOwnership}
            onDelete={deleteOrganizationAction}
          />
        </PageSection>
      )}
      {isAdminEmail(session.user.email) && (
        <PageSection title={t("registration")} description={t("registrationDescription")}>
          <SignupPolicyForm initialAllowed={isPublicSignupAllowed()} />
        </PageSection>
      )}
    </SettingsLayout>
  );
}
