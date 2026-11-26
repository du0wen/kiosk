import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { can } from "@/lib/permissions";
import { recordOrgAuditEvent } from "@/lib/audit";
import {
  createOrgTemplate,
  deleteOrgTemplate,
  getOrgTemplateBySlug,
  isTemplateCategory,
  listOrgTemplates,
  listOrgTemplateVersions,
  restoreOrgTemplateVersion,
  STARTER_TEMPLATES,
  updateOrgTemplate,
  type TemplateCategory,
} from "@/lib/templates";
import { PageSection } from "../../_components/PageHeader";
import { SettingsLayout } from "../_components/SettingsLayout";
import {
  TemplatesClient,
  type TemplateItemView,
} from "./_components/TemplatesClient";

export default async function TemplatesSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/templates");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);
  const canManage = !!role && can(role, "org.update");
  const t = await getTranslations("templates");

  const rows = await listOrgTemplates({ organizationId: org });
  const items: TemplateItemView[] = await Promise.all(
    rows.map(async (row) => {
      const hydrated = await getOrgTemplateBySlug({
        organizationId: org,
        slug: row.slug,
      }).catch(() => null);
      const versions = await listOrgTemplateVersions({
        organizationId: org,
        templateId: row.id,
      });
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        category: row.category as TemplateCategory,
        description: row.description ?? "",
        promptGuidelines: row.promptGuidelines ?? "",
        html: hydrated?.html ?? "",
        currentVersion: row.currentVersion,
        isDefault: row.isDefault,
        updatedAt: row.updatedAt.toISOString(),
        versions: versions.map((v) => ({
          versionNumber: v.versionNumber,
          changeNote: v.changeNote ?? "",
          createdAt: v.createdAt.toISOString(),
        })),
      };
    }),
  );

  async function saveTemplateAction(input: {
    id?: string;
    slug: string;
    name: string;
    category: string;
    description: string;
    promptGuidelines: string;
    html: string;
    changeNote: string;
    isDefault: boolean;
  }): Promise<{ ok: boolean }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false };
    if (!isTemplateCategory(input.category)) return { ok: false };
    try {
      if (input.id) {
        const updated = await updateOrgTemplate({
          organizationId: o,
          templateId: input.id,
          name: input.name,
          category: input.category,
          description: input.description,
          promptGuidelines: input.promptGuidelines,
          html: input.html,
          isDefault: input.isDefault,
          actorUserId: s.user.id,
          changeNote: input.changeNote,
        });
        if (!updated) return { ok: false };
        await recordOrgAuditEvent({
          organizationId: o,
          actorUserId: s.user.id,
          actorEmail: s.user.email,
          action: "template.update",
          targetType: "template",
          targetId: updated.slug,
          summary: `${updated.name} (v${updated.currentVersion})`,
        });
      } else {
        const created = await createOrgTemplate({
          organizationId: o,
          slug: input.slug,
          name: input.name,
          category: input.category,
          description: input.description,
          promptGuidelines: input.promptGuidelines,
          html: input.html,
          isDefault: input.isDefault,
          actorUserId: s.user.id,
          changeNote: input.changeNote,
        });
        await recordOrgAuditEvent({
          organizationId: o,
          actorUserId: s.user.id,
          actorEmail: s.user.email,
          action: "template.create",
          targetType: "template",
          targetId: created.slug,
          summary: `${created.name} (${created.category})`,
        });
      }
      revalidatePath("/settings/templates");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async function importStartersAction(): Promise<{ ok: boolean }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false };

    const existing = await listOrgTemplates({ organizationId: o });
    const existingSlugs = new Set(existing.map((e) => e.slug));
    for (const starter of STARTER_TEMPLATES) {
      if (existingSlugs.has(starter.slug)) continue;
      await createOrgTemplate({
        organizationId: o,
        slug: starter.slug,
        name: starter.name,
        category: starter.category,
        description: starter.description,
        promptGuidelines: starter.promptGuidelines,
        html: starter.html,
        isDefault: true,
        actorUserId: s.user.id,
        changeNote: "Imported built-in starter template",
      });
    }
    await recordOrgAuditEvent({
      organizationId: o,
      actorUserId: s.user.id,
      actorEmail: s.user.email,
      action: "template.create",
      targetType: "template",
      summary: "Imported starter templates",
    });
    revalidatePath("/settings/templates");
    return { ok: true };
  }

  async function restoreVersionAction(
    templateId: string,
    versionNumber: number,
  ): Promise<{ ok: boolean }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false };
    const restored = await restoreOrgTemplateVersion({
      organizationId: o,
      templateId,
      versionNumber,
      actorUserId: s.user.id,
    });
    if (!restored) return { ok: false };
    await recordOrgAuditEvent({
      organizationId: o,
      actorUserId: s.user.id,
      actorEmail: s.user.email,
      action: "template.restore",
      targetType: "template",
      targetId: restored.slug,
      summary: `Restored v${versionNumber} -> v${restored.currentVersion}`,
    });
    revalidatePath("/settings/templates");
    return { ok: true };
  }

  async function deleteTemplateAction(templateId: string): Promise<{ ok: boolean }> {
    "use server";
    const s = await getSession();
    if (!s) return { ok: false };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false };
    const ok = await deleteOrgTemplate({ organizationId: o, templateId });
    if (ok) {
      await recordOrgAuditEvent({
        organizationId: o,
        actorUserId: s.user.id,
        actorEmail: s.user.email,
        action: "template.delete",
        targetType: "template",
        targetId: templateId,
      });
      revalidatePath("/settings/templates");
    }
    return { ok };
  }

  return (
    <SettingsLayout>
      <PageSection title={t("title")} description={t("subtitle")}>
        <TemplatesClient
          key={org}
          items={items}
          canManage={canManage}
          onSave={saveTemplateAction}
          onImportStarters={importStartersAction}
          onRestore={restoreVersionAction}
          onDelete={deleteTemplateAction}
        />
      </PageSection>
    </SettingsLayout>
  );
}
