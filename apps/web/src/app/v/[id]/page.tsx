import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { getPublicPage, pageRawUrl } from "@/lib/pages";
import { isOrgMember } from "@/lib/console";
import { getOrgBranding } from "@/lib/org-settings";
import { signServeToken } from "@/lib/serve-token";
import { resolveWatermarkDisplay } from "@/lib/watermark";
import { ViewerFrame } from "./_components/ViewerFrame";
import styles from "./_components/ViewerFrame.module.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type Props = { params: Promise<{ id: string }> };

const DEFAULT_ACCENT = "#0f766e";

export default async function ViewerPage({ params }: Props) {
  const { id } = await params;
  const page = await getPublicPage(id);
  if (!page) notFound();

  const brand = await getOrgBranding(page.organizationId);
  const accent = brand.themeColor ?? DEFAULT_ACCENT;
  const rawUrl = pageRawUrl(id);

  let src = rawUrl;
  let viewerEmail: string | null = null;
  if (page.visibility !== "public") {
    const session = await getSession();
    if (!session) redirect(`/sign-in?callback=/v/${id}`);
    if (!(await isOrgMember(session.user.id, page.organizationId))) {
      const t = await getTranslations("viewer");
      return (
        <div className={styles.center}>
          <div className={styles.card}>
            <h1>{t("noAccessTitle")}</h1>
            <p>{t("noAccessBody")}</p>
            <Link href="/pages">{t("backToConsole")}</Link>
          </div>
        </div>
      );
    }
    viewerEmail = session.user.email ?? null;
    // Shell holds the app-origin session, so it mints the serve-token here and
    // hands it to the cross-origin frame — no serve→app→serve bounce.
    const k = signServeToken(page.organizationId, session.user.id);
    src = `${rawUrl}?k=${encodeURIComponent(k)}`;
  }

  const wm = resolveWatermarkDisplay({
    mode: brand.watermarkMode,
    scope: brand.watermarkScope,
    text: brand.exportWatermark,
    orgName: brand.name,
    includeViewer: brand.watermarkIncludeViewer,
    opacity: brand.watermarkOpacity,
    visibility: page.visibility === "public" ? "public" : "org",
    viewerEmail,
  });

  return (
    <ViewerFrame
      src={src}
      rawUrl={rawUrl}
      reportHref={`/report?url=${encodeURIComponent(rawUrl)}`}
      consoleHref="/pages"
      brandName={brand.name ?? "Kiosk"}
      accent={accent}
      title={page.title ?? id}
      watermark={
        wm.active && wm.mode === "fullpage" && wm.label
          ? { label: wm.label, opacity: wm.opacity }
          : undefined
      }
      hideRawLink={wm.hideRawLink}
    />
  );
}
