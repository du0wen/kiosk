import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { can } from "@/lib/permissions";
import { pageShellUrl } from "@/lib/pages";
import { PageHeader } from "../../_components/PageHeader";
import { getConsolePageDetail } from "../_lib/page-detail";
import { pageOwnerLabel } from "../_lib/rows";
import { renamePageAction, setPageVisibilityAction, deletePageAction } from "../_lib/page-actions";
import { PageActions } from "../_components/PageActions";
import { PageDetailSummary } from "../_components/PageDetailSummary";
import { RecentVersions } from "../_components/RecentVersions";
import styles from "./page.module.css";

type Props = { params: Promise<{ pageId: string }> };

export default async function PageDetailPage({ params }: Props) {
  const { pageId } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/pages/${pageId}`);
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);
  if (!role) redirect("/sign-in"); // not a member of the active org
  // Org-scoped: a page id from another org resolves to null → 404 (no leak).
  const detail = await getConsolePageDetail(org, pageId);
  if (!detail) notFound();

  const t = await getTranslations("pages");
  const common = await getTranslations("common");
  const formatter = await getFormatter();
  const formatDate = (date: Date) => formatter.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  const shareUrl = pageShellUrl(detail.publicId);
  const ownerLabel = pageOwnerLabel(detail.ownerName, detail.ownerEmail, common("unknown"));
  const title = detail.title ?? detail.publicId;
  // Capability from the already-resolved role + page ownership (server re-checks).
  const isResourceOwner = detail.createdBy === session.user.id;

  return (
    <>
      <Link className={styles.back} href="/pages">
        <ArrowLeft size={15} />
        {t("backToPages")}
      </Link>
      <PageHeader
        title={title}
        subtitle={t("detailSubtitle")}
        actions={<PageActions publicId={detail.publicId} title={title} url={shareUrl} visibility={detail.visibility} canRename={can(role, "page.edit")} canSetVisibility={can(role, "page.setVisibility", { isResourceOwner })} canDelete={can(role, "page.delete", { isResourceOwner })} renameAction={renamePageAction} deleteAction={deletePageAction} visibilityAction={setPageVisibilityAction} deleteRedirect="/pages" />}
      />
      <PageDetailSummary detail={detail} shareUrl={shareUrl} ownerLabel={ownerLabel} t={(key) => t(key)} formatDate={formatDate} formatNumber={(value) => formatter.number(value)} />
      <RecentVersions versions={detail.recentVersions} publicId={detail.publicId} t={(key) => t(key)} formatDate={formatDate} />
    </>
  );
}
