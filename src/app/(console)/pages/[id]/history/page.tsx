import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { listPageVersions, getPageVersionContent, updatePage } from "@/lib/pages";
import { can } from "@/lib/permissions";

type Props = { params: Promise<{ id: string }> };

export default async function HistoryPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/pages/${id}/history`);
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const versions = await listPageVersions({ publicId: id, organizationId: org });

  async function restore(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) return;
    const o = await resolveActiveOrg(s);
    if (!o) return;
    const role = await roleInOrg(s.user.id, o);
    if (!role || !can(role, "page.edit")) return;
    const html = await getPageVersionContent({
      publicId: id,
      organizationId: o,
      versionId: String(formData.get("versionId")),
    });
    if (html == null) return;
    await updatePage({ publicId: id, organizationId: o, userId: s.user.id, html });
    revalidatePath(`/pages/${id}/history`);
    revalidatePath("/pages");
  }

  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16 }}>
      <h1>Version history</h1>
      <a href="/pages">← Back</a>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gap: 6,
          marginTop: 12,
        }}
      >
        {versions.map((v, i) => (
          <li
            key={v.id}
            style={{
              border: "1px solid #8883",
              borderRadius: 8,
              padding: 10,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>
              {new Date(v.createdAt).toLocaleString()} — {v.editedByEmail ?? "unknown"}
              {i === 0 && <em style={{ opacity: 0.6 }}> (current)</em>}
            </span>
            {i !== 0 && (
              <form action={restore} style={{ marginLeft: "auto" }}>
                <input type="hidden" name="versionId" value={v.id} />
                <button type="submit">Restore</button>
              </form>
            )}
          </li>
        ))}
        {versions.length === 0 && <li style={{ opacity: 0.6 }}>No versions.</li>}
      </ul>
    </main>
  );
}
