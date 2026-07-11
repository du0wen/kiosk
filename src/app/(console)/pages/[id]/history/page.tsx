import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
import { listPageVersions } from "@/lib/pages";

type Props = { params: Promise<{ id: string }> };

export default async function HistoryPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/pages/${id}/history`);
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const versions = await listPageVersions({ publicId: id, organizationId: org });
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
        {versions.map((v) => (
          <li
            key={v.id}
            style={{
              border: "1px solid #8883",
              borderRadius: 8,
              padding: 10,
              fontSize: 14,
            }}
          >
            {new Date(v.createdAt).toLocaleString()} — {v.editedByEmail ?? "unknown"}
          </li>
        ))}
        {versions.length === 0 && <li style={{ opacity: 0.6 }}>No versions.</li>}
      </ul>
    </main>
  );
}
