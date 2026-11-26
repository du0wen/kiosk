import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { can } from "@/lib/permissions";
import { getOrgSettings, getOrgBranding, setOrgSettings } from "@/lib/org-settings";
import {
  clampWatermarkOpacity,
  isWatermarkMode,
  isWatermarkScope,
} from "@/lib/watermark";
import { PageSection } from "../../_components/PageHeader";
import { SettingsLayout } from "../_components/SettingsLayout";
import { BrandingForm, type BrandingState } from "../_components/BrandingForm";

export default async function BrandingPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/branding");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);
  const canEdit = !!role && can(role, "org.update");
  const branding = await getOrgBranding(org);
  const settings = await getOrgSettings(org);
  const bt = await getTranslations("branding");

  async function saveBranding(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
    "use server";
    // Re-validate the active org + permission on the server for every save.
    const s = await getSession();
    if (!s) return { ok: false, error: "failed" };
    const o = await resolveActiveOrg(s);
    if (!o) return { ok: false, error: "failed" };
    const r = await roleInOrg(s.user.id, o);
    if (!r || !can(r, "org.update")) return { ok: false, error: "forbidden" };
    const color = String(formData.get("themeColor") || "");
    const wm = String(formData.get("exportWatermark") || "");
    const modeRaw = String(formData.get("watermarkMode") || "footer");
    const scopeRaw = String(formData.get("watermarkScope") || "org_only");
    const includeViewer = formData.get("watermarkIncludeViewer") === "on";
    const opacity = clampWatermarkOpacity(Number(formData.get("watermarkOpacity") ?? 8));
    try {
      await setOrgSettings(o, {
        themeColor: color ? color : null,
        exportWatermark: wm ? wm : null,
        watermarkMode: isWatermarkMode(modeRaw) ? modeRaw : "footer",
        watermarkScope: isWatermarkScope(scopeRaw) ? scopeRaw : "org_only",
        watermarkIncludeViewer: includeViewer,
        watermarkOpacity: opacity,
      });
    } catch {
      // No longer swallowed silently: surface a failure the client can show.
      return { ok: false, error: "failed" };
    }
    revalidatePath("/settings/branding");
    revalidatePath("/settings");
    return { ok: true };
  }

  return (
    <SettingsLayout>
      <PageSection title={bt("title")} description={bt("subtitle")}>
        {/* key={org}: remount on org switch so success/error state and the
            color/watermark inputs reset to the newly active org's values. */}
        <BrandingForm
          key={org}
          initialColor={settings.themeColor ?? "#0f766e"}
          initialWatermark={settings.exportWatermark ?? ""}
          initialWatermarkMode={settings.watermarkMode}
          initialWatermarkScope={settings.watermarkScope}
          initialIncludeViewer={settings.watermarkIncludeViewer}
          initialOpacity={settings.watermarkOpacity}
          organizationName={branding.name ?? "Kiosk"}
          canEdit={canEdit}
          action={saveBranding}
        />
      </PageSection>
    </SettingsLayout>
  );
}
