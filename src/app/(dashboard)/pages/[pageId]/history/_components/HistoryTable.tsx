"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, type DataTableColumn } from "@/components/ui";

type Version = { id: string; createdAt: string; editor: string; current: boolean };
type Action = (data: FormData) => Promise<void>;

export function HistoryTable({ versions, restoreAction }: { versions: Version[]; restoreAction: Action }) {
  const t = useTranslations("history"); const common = useTranslations("common"); const locale = useLocale(); const router = useRouter(); const [restoreId, setRestoreId] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  const columns: DataTableColumn<Version>[] = [
    { key: "created", header: t("created"), render: (row) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt)) },
    { key: "editor", header: t("editor"), priority: "medium", render: (row) => row.editor },
    { key: "status", header: t("status"), render: (row) => row.current ? <Badge tone="success">{t("current")}</Badge> : <Badge tone="neutral">{t("version")}</Badge> },
    { key: "action", header: "", align: "end", render: (row) => row.current ? null : <Button size="sm" onClick={() => setRestoreId(row.id)}><RotateCcw size={15} />{t("restore")}</Button> },
  ];
  return <><DataTable columns={columns} rows={versions} getRowKey={(row) => row.id} empty={<EmptyState icon={<History size={20} />} title={t("title")} description={t("empty")} />} /><ConfirmDialog open={!!restoreId} title={t("restore")} description={t("restoreConfirm")} confirmLabel={t("restore")} cancelLabel={common("cancel")} closeLabel={common("close")} busy={pending} onClose={() => setRestoreId(null)} onConfirm={() => { if (!restoreId) return; startTransition(async () => { const data = new FormData(); data.set("versionId", restoreId); await restoreAction(data); setRestoreId(null); router.refresh(); }); }} /></>;
}
