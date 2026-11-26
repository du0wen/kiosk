import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { listPageVersions, getPageVersionContent, updatePage } from "@/lib/pages";
import { can } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "../../../_components/PageHeader";
import { HistoryTable } from "./_components/HistoryTable";
import styles from "./page.module.css";

type Props = { params: Promise<{ pageId: string }> };

export default async function HistoryPage({ params }: Props) {
  const { pageId: id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/pages/${id}/history`);
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const versions = await listPageVersions({ publicId: id, organizationId: org });
  const t = await getTranslations("history");
  const common = await getTranslations("common");

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

  return <><Link className={styles.back} href="/pages"><ArrowLeft size={15} />{t("backToPages")}</Link><PageHeader title={t("title")} subtitle={t("subtitle")} /><HistoryTable restoreAction={restore} versions={versions.map((version, index) => ({ id: version.id, createdAt: new Date(version.createdAt).toISOString(), editor: version.editedByEmail ?? common("unknown"), current: index === 0 }))} /></>;
}
