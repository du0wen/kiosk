import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { getOrgSettings, setOrgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { LocaleSwitcher } from "@/app/_components/LocaleSwitcher";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings");
  const org = await resolveActiveOrg(session);
  const role = org ? await roleInOrg(session.user.id, org) : null;
  const canEdit = !!role && can(role, "org.update");
  const s = org
    ? await getOrgSettings(org)
    : { themeColor: null, exportWatermark: null };

  async function save(formData: FormData) {
    "use server";
    const ss = await getSession();
    if (!ss) return;
    const o = await resolveActiveOrg(ss);
    if (!o) return;
    const r = await roleInOrg(ss.user.id, o);
    if (!r || !can(r, "org.update")) return;
    const color = String(formData.get("themeColor") || "");
    const wm = String(formData.get("exportWatermark") || "");
    try {
      await setOrgSettings(o, {
        themeColor: color ? color : null,
        exportWatermark: wm ? wm : null,
      });
    } catch {
      // invalid hex — keep the current value
    }
    revalidatePath("/settings");
  }

  return (
    <main
      style={{ maxWidth: 720, margin: "4vh auto", padding: 16, display: "grid", gap: 16 }}
    >
      <h1>Settings</h1>
      <p>{session.user.email}</p>
      <div>
        <LocaleSwitcher />
      </div>
      <p>
        <a href="/settings/tokens">API Tokens</a> ·{" "}
        <a href="/settings/members">Members</a> · <a href="/pages">Pages</a>
      </p>
      <section>
        <h2 style={{ fontSize: 16 }}>Branding</h2>
        {canEdit ? (
          <form action={save} style={{ display: "grid", gap: 10, maxWidth: 360 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              Theme color
              <input
                type="color"
                name="themeColor"
                defaultValue={s.themeColor ?? "#4f46e5"}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              Export watermark
              <input
                name="exportWatermark"
                defaultValue={s.exportWatermark ?? ""}
                placeholder="e.g. ACME — confidential"
              />
            </label>
            <button type="submit">Save</button>
          </form>
        ) : (
          <p style={{ opacity: 0.7 }}>Only owners/admins can edit branding.</p>
        )}
      </section>
    </main>
  );
}
