import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPublicPage, pageRawUrl } from "@/lib/pages";
import { isOrgMember } from "@/lib/console";
import { getOrgBranding } from "@/lib/org-settings";
import { signServeToken } from "@/lib/serve-token";

type Props = { params: Promise<{ id: string }> };

const shell: React.CSSProperties = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  margin: 0,
};
const bar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 14px",
  borderBottom: "1px solid #8883",
  font: "14px system-ui, sans-serif",
};

export default async function ViewerPage({ params }: Props) {
  const { id } = await params;
  const page = await getPublicPage(id);
  if (!page) notFound();

  const brand = await getOrgBranding(page.organizationId);
  const accent = brand.themeColor ?? "#4f46e5";

  let src = pageRawUrl(id);
  if (page.visibility !== "public") {
    const session = await getSession();
    if (!session) redirect(`/sign-in?callback=/v/${id}`);
    if (!(await isOrgMember(session.user.id, page.organizationId))) {
      return (
        <main
          style={{
            maxWidth: 420,
            margin: "12vh auto",
            padding: 16,
            font: "15px system-ui, sans-serif",
          }}
        >
          <h1>No access</h1>
          <p style={{ opacity: 0.7 }}>
            This page is private to another organization.
          </p>
        </main>
      );
    }
    const k = signServeToken(page.organizationId, session.user.id);
    src = `${pageRawUrl(id)}?k=${encodeURIComponent(k)}`;
  }

  return (
    <div style={shell}>
      <header style={{ ...bar, borderBottomColor: accent }}>
        <strong style={{ color: accent }}>{brand.name ?? "Kiosk"}</strong>
        <span style={{ opacity: 0.8 }}>{page.title ?? id}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12, opacity: 0.7 }}>
          <a href={pageRawUrl(id)} target="_blank" rel="noreferrer">
            open raw
          </a>
          <a href={`/report?url=${encodeURIComponent(pageRawUrl(id))}`}>report</a>
        </span>
      </header>
      <iframe
        src={src}
        sandbox="allow-scripts"
        title={page.title ?? "page"}
        style={{ flex: 1, border: 0, width: "100%" }}
      />
    </div>
  );
}
