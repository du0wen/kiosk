import type { Route } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileText, Search } from "lucide-react";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { EmptyState } from "@/components/ui";
import { PageHeader } from "../_components/PageHeader";
import { getPagesSummary, queryConsolePages, listPageOwners, ownerOptions } from "./_lib/rows";
import { canonicalizeOwner, parsePageListParams, pagesHref } from "./_lib/list-params";
import { pageWindow, emptyState } from "./_lib/pagination";
import { renamePageAction, setPageVisibilityAction, deletePageAction } from "./_lib/page-actions";
import { PagesTable } from "./_components/PagesTable";
import { PagesToolbar } from "./_components/PagesToolbar";
import { Pagination } from "./_components/Pagination";
import { WorkspaceSummary } from "./_components/WorkspaceSummary";
import { CliSetup } from "./_components/CliSetup";
import { ClearSearchButton } from "./_components/ClearSearchButton";

export default async function PagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/pages");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const params = parsePageListParams(await searchParams);
  // Normalize `owner=<currentUserId>` → the canonical `owner=me` (filters kept).
  const canonicalOwner = canonicalizeOwner(params.owner, session.user.id);
  if (canonicalOwner !== params.owner) redirect(pagesHref({ ...params, owner: canonicalOwner }) as Route);
  const t = await getTranslations("pages");
  const common = await getTranslations("common");
  const formatter = await getFormatter();
  const apiBase = process.env.APP_ORIGIN ? `${process.env.APP_ORIGIN}/api/v1` : "";

  const [role, summary, owners, result] = await Promise.all([
    roleInOrg(session.user.id, org),
    getPagesSummary(org), // org-wide totals — independent of the filters
    listPageOwners(org),
    queryConsolePages(org, params, session.user.id),
  ]);
  if (!role) redirect("/sign-in"); // not a member of the active org
  const { items, total } = result;

  // Over-bounds page → normalize to the last valid page (filters preserved).
  const { pages: totalPages } = pageWindow(total, params.page);
  if (total > 0 && params.page > totalPages) redirect(pagesHref({ ...params, page: totalPages }) as Route);

  const state = emptyState(summary.total, total);
  const ownerFilterOptions = ownerOptions(owners, session.user.id, common("unknown"));

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<CliSetup apiBase={apiBase} />} />
      <WorkspaceSummary summary={summary} t={(key) => t(key)} formatNumber={(value) => formatter.number(value)} />
      {state !== "first" && <PagesToolbar params={params} owners={ownerFilterOptions} />}
      {state === "first" ? (
        <EmptyState icon={<FileText size={20} />} title={t("emptyTitle")} description={t("empty")} />
      ) : state === "no-match" ? (
        <EmptyState icon={<Search size={20} />} title={t("noResultsTitle")} description={t("noMatching")} action={<ClearSearchButton label={t("clearFilters")} />} />
      ) : (
        <>
          <PagesTable rows={items} role={role} currentUserId={session.user.id} t={(key, values) => t(key, values)} formatDate={(date) => formatter.dateTime(date, { dateStyle: "medium", timeStyle: "short" })} unknown={common("unknown")} renameAction={renamePageAction} deleteAction={deletePageAction} visibilityAction={setPageVisibilityAction} />
          <Pagination params={params} total={total} t={(key, values) => t(key, values)} />
        </>
      )}
    </>
  );
}
