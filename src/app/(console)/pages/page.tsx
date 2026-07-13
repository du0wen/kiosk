import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import {
  listPages,
  renameTitle,
  softDeletePage,
  setPageVisibility,
  getPage,
  pageShellUrl,
} from "@/lib/pages";
import { can } from "@/lib/permissions";
import { LocaleSwitcher } from "@/app/_components/LocaleSwitcher";
import { CopyButton } from "@/app/_components/CopyButton";

export default async function PagesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/pages");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const t = await getTranslations("pages");
  const { items } = await listPages({ organizationId: org });

  async function rename(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveActiveOrg(s));
    if (!o) return;
    await renameTitle(String(formData.get("id")), o, String(formData.get("title")));
    revalidatePath("/pages");
  }
  async function remove(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) return;
    const org = await resolveActiveOrg(s);
    if (!org) return;
    const role = await roleInOrg(s.user.id, org);
    if (!role) return;
    const page = await getPage({
      publicId: String(formData.get("id")),
      organizationId: org,
    });
    if (!page) return;
    if (
      !can(role, "page.delete", {
        isResourceOwner: page.createdBy === s.user.id,
      })
    ) {
      return;
    }
    await softDeletePage({
      publicId: page.publicId,
      organizationId: org,
      userId: s.user.id,
    });
    revalidatePath("/pages");
  }
  async function setVis(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) return;
    const org = await resolveActiveOrg(s);
    if (!org) return;
    const role = await roleInOrg(s.user.id, org);
    if (!role) return;
    const page = await getPage({
      publicId: String(formData.get("id")),
      organizationId: org,
    });
    if (!page) return;
    if (
      !can(role, "page.setVisibility", {
        isResourceOwner: page.createdBy === s.user.id,
      })
    ) {
      return;
    }
    await setPageVisibility({
      publicId: page.publicId,
      organizationId: org,
      userId: s.user.id,
      visibility: String(formData.get("to")) === "public" ? "public" : "org",
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
            const url = pageShellUrl(p.publicId);
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
                  <span style={{ fontSize: 12, opacity: 0.7, alignSelf: "center" }}>
                    {p.visibility === "public" ? t("public") : t("private")}
                  </span>
                  <form action={setVis}>
                    <input type="hidden" name="id" value={p.publicId} />
                    <input
                      type="hidden"
                      name="to"
                      value={p.visibility === "public" ? "org" : "public"}
                    />
                    <button type="submit">
                      {p.visibility === "public" ? t("makePrivate") : t("makePublic")}
                    </button>
                  </form>
                  <a href={`/pages/${p.publicId}/history`}>
                    <button type="button">{t("history")}</button>
                  </a>
                  <details style={{ display: "inline-block" }}>
                    <summary style={{ cursor: "pointer", listStyle: "none" }}>
                      <span
                        style={{
                          border: "1px solid #8883",
                          borderRadius: 6,
                          padding: "2px 8px",
                        }}
                      >
                        {t("export")} ▾
                      </span>
                    </summary>
                    <div
                      style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}
                    >
                      {["md", "html", "pdf", "png", "jpeg"].map((f) => (
                        <a key={f} href={`/pages/${p.publicId}/export?format=${f}`}>
                          {f}
                        </a>
                      ))}
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
