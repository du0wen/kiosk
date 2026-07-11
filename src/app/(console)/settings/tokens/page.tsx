import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
import { createToken, listTokens, revokeToken } from "@/lib/token";
import { CopyButton } from "@/app/_components/CopyButton";

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/tokens");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const t = await getTranslations("tokens");
  const { created } = await searchParams;
  const tokens = await listTokens(org);

  async function create(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveActiveOrg(s));
    if (!o || !s) return;
    const { plaintext } = await createToken({
      userId: s.user.id,
      organizationId: o,
      name: String(formData.get("name") || "token"),
    });
    redirect(`/settings/tokens?created=${encodeURIComponent(plaintext)}`);
  }
  async function revoke(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveActiveOrg(s));
    if (!o) return;
    await revokeToken(String(formData.get("id")), o);
    revalidatePath("/settings/tokens");
  }

  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16 }}>
      <h1>{t("title")}</h1>
      {created && (
        <p style={{ padding: 12, border: "1px solid #8883", borderRadius: 8 }}>
          <code>{created}</code>
          <br />
          <small>{t("shownOnce")}</small>{" "}
          <CopyButton text={created} label={t("copy")} copiedLabel={t("copied")} />
        </p>
      )}
      <form action={create} style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input name="name" placeholder={t("name")} />
        <button type="submit">{t("create")}</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {tokens.map((tk) => (
          <li
            key={tk.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              border: "1px solid #8883",
              borderRadius: 8,
              padding: 10,
            }}
          >
            <span>
              <strong>{tk.name}</strong> <code>{tk.tokenPrefix}…</code>
              {tk.revokedAt ? ` (${t("revoked")})` : ""}
            </span>
            {!tk.revokedAt && (
              <form action={revoke}>
                <input type="hidden" name="id" value={tk.id} />
                <button type="submit">{t("revoke")}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
