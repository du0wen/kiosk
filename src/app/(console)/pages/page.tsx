import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveUserOrg, resolveUserOrgRole } from "@/lib/console";
import {
  listPages,
  renameTitle,
  softDeletePage,
  getPage,
  pageUrl,
} from "@/lib/pages";
import { can } from "@/lib/permissions";
import { LocaleSwitcher } from "@/app/_components/LocaleSwitcher";
import { CopyButton } from "@/app/_components/CopyButton";

export default async function PagesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/pages");
  const org = await resolveUserOrg(session.user.id);
  if (!org) redirect("/sign-in");
  const t = await getTranslations("pages");
  const { items } = await listPages({ organizationId: org });

  async function rename(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveUserOrg(s.user.id));
    if (!o) return;
    await renameTitle(String(formData.get("id")), o, String(formData.get("title")));
    revalidatePath("/pages");
  }
  async function remove(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) return;
    const ctx = await resolveUserOrgRole(s.user.id);
    if (!ctx) return;
    const page = await getPage({
      publicId: String(formData.get("id")),
      organizationId: ctx.organizationId,
    });
    if (!page) return;
    if (
      !can(ctx.role, "page.delete", {
        isResourceOwner: page.createdBy === s.user.id,
      })
    ) {
      return;
    }
    await softDeletePage({
      publicId: page.publicId,
      organizationId: ctx.organizationId,
      userId: s.user.id,
    });
    revalidatePath("/pages");
  }

  return (
    <main style={{ maxWidth: 820, margin: "4vh auto", padding: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>{t("title")}</h1>
        <LocaleSwitcher />
      </header>
      {items.length === 0 ? (
        <p style={{ opacity: 0.7 }}>{t("empty")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {items.map((p) => {
            const url = pageUrl(p.publicId);
            return (
              <li
                key={p.publicId}
                style={{ border: "1px solid #8883", borderRadius: 8, padding: 12 }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                >
                  <strong>{p.title ?? p.publicId}</strong>
                  <span style={{ opacity: 0.6 }}>
                    {p.viewCount} {t("views")}
                  </span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>{" "}
                  · {t("updated")} {new Date(p.updatedAt).toLocaleString()}
                </div>
                <div
                  style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}
                >
                  <CopyButton text={url} label={t("copy")} copiedLabel={t("copied")} />
                  <a href={url} target="_blank" rel="noreferrer">
                    <button type="button">{t("open")}</button>
                  </a>
                  <form action={rename} style={{ display: "inline-flex", gap: 4 }}>
                    <input type="hidden" name="id" value={p.publicId} />
                    <input name="title" defaultValue={p.title ?? ""} placeholder={t("rename")} />
                    <button type="submit">{t("rename")}</button>
                  </form>
                  <form action={remove}>
                    <input type="hidden" name="id" value={p.publicId} />
                    <button type="submit">{t("delete")}</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
