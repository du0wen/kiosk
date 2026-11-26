import Link from "next/link";
import { Badge, DataTable, type DataTableColumn } from "@/components/ui";
import { FileText } from "lucide-react";
import { pageShellUrl } from "@/lib/pages";
import { can, type Role } from "@/lib/permissions";
import { dashboardPath } from "../../_lib/paths";
import { pageOwnerLabel } from "../_lib/rows";
import type { ActionResult } from "../_lib/page-actions";
import { PageActions } from "./PageActions";
import styles from "./PagesTable.module.css";

// Rows are always non-empty here — the list page owns the three empty states.
type Row = Awaited<ReturnType<typeof import("../_lib/rows").queryConsolePages>>["items"][number];
type Action = (data: FormData) => Promise<ActionResult>;

export function PagesTable({ rows, role, currentUserId, t, formatDate, unknown, renameAction, deleteAction, visibilityAction }: { rows: Row[]; role: Role; currentUserId: string; t: (key: string, values?: Record<string, string | number | Date>) => string; formatDate: (date: Date) => string; unknown: string; renameAction: Action; deleteAction: Action; visibilityAction: Action }) {
  const columns: DataTableColumn<Row>[] = [
    { key: "page", header: t("page"), render: (row) => <div className={styles.page}><span className={styles.fileIcon}><FileText size={16} /></span><span><Link href={dashboardPath.pageDetail(row.publicId)} className={styles.pageLink}>{row.title ?? row.publicId}</Link><small>{pageShellUrl(row.publicId)}</small></span></div> },
    { key: "visibility", header: t("visibility"), priority: "medium", render: (row) => <Badge tone={row.visibility === "public" ? "success" : "neutral"}>{row.visibility === "public" ? t("public") : t("private")}</Badge> },
    { key: "views", header: t("viewsColumn"), priority: "low", render: (row) => row.viewCount },
    { key: "updated", header: t("updatedColumn"), priority: "medium", render: (row) => formatDate(row.updatedAt) },
    { key: "owner", header: t("ownerColumn"), priority: "low", render: (row) => pageOwnerLabel(row.ownerName, row.ownerEmail, unknown) },
    {
      key: "actions", header: t("actions"), align: "end",
      // Capability from role + row ownership; the server re-checks identically.
      render: (row) => {
        const isResourceOwner = row.createdBy === currentUserId;
        return <PageActions publicId={row.publicId} title={row.title ?? row.publicId} url={pageShellUrl(row.publicId)} visibility={row.visibility} canRename={can(role, "page.edit")} canSetVisibility={can(role, "page.setVisibility", { isResourceOwner })} canDelete={can(role, "page.delete", { isResourceOwner })} renameAction={renameAction} deleteAction={deleteAction} visibilityAction={visibilityAction} />;
      },
    },
  ];
  return <div className={styles.tableWrap}><DataTable columns={columns} rows={rows} getRowKey={(row) => row.publicId} /></div>;
}
