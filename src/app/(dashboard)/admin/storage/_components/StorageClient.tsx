"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Menu,
  MenuItem,
  Notice,
  Select,
  TextField,
  type DataTableColumn,
} from "@/components/ui";
import type { StorageProvider, StorageProviderConfig } from "@/lib/storage/contracts";
import styles from "./StorageClient.module.css";

export type StorageActionState = { ok: boolean; error?: string };
type Action = (data: FormData) => Promise<StorageActionState>;

type ProfileRow = {
  id: string;
  name: string;
  provider: StorageProvider;
  config: StorageProviderConfig;
  enabled: boolean;
  isDefault: boolean;
  status: "unverified" | "healthy" | "unhealthy";
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  objectCount: number;
  storedBytes: number;
};

type MigrationRow = {
  id: string;
  kind: string;
  status: string;
  targetProfileName: string | null;
  processedCount: number;
  migratedCount: number;
  failedCount: number;
  totalBytes: number;
  cursor: string | null;
  updatedAt: string;
};

function migrationKind(t: ReturnType<typeof useTranslations>, kind: string): string {
  const keys: Record<string, string> = {
    backfill: "migrationKindBackfill",
    repoint: "migrationKindRepoint",
    purge: "migrationKindPurge",
    orphan_scan: "migrationKindOrphanScan",
    orphan_delete: "migrationKindOrphanDelete",
  };
  return t(keys[kind] ?? "migrationKindUnknown");
}

function migrationStatus(t: ReturnType<typeof useTranslations>, status: string): string {
  const keys: Record<string, string> = {
    pending: "migrationStatusPending",
    running: "migrationStatusRunning",
    completed: "migrationStatusCompleted",
    completed_with_failures: "migrationStatusCompletedWithFailures",
    failed: "migrationStatusFailed",
  };
  return t(keys[status] ?? "migrationStatusFailed");
}

function destination(row: ProfileRow): string {
  if (row.provider === "s3") {
    const config = row.config as { endpoint?: string; bucket: string };
    return config.endpoint ? `${config.endpoint} / ${config.bucket}` : `s3://${config.bucket}`;
  }
  if (row.provider === "vercel_blob") return "Vercel Blob";
  return (row.config as { rootPath: string }).rootPath;
}

export function StorageClient({ profiles, migrations, storageMode, allowFilesystem, saveAction, operationAction }: { profiles: ProfileRow[]; migrations: MigrationRow[]; storageMode: string; allowFilesystem: boolean; saveAction: Action; operationAction: Action }) {
  const t = useTranslations("storageAdmin");
  const common = useTranslations("common");
  const router = useRouter();
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; profile: ProfileRow } | null>(null);
  const [provider, setProvider] = useState<StorageProvider>("s3");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "tested" | "error" | null>(null);
  const [saving, startSaving] = useTransition();
  const [operating, startOperating] = useTransition();

  const run = (id: string, operation: string) => {
    if (operating) return;
    startOperating(async () => {
      const data = new FormData();
      data.set("id", id);
      data.set("operation", operation);
      const result = await operationAction(data);
      if (operation !== "delete") {
        setFeedback(result.ok ? (operation === "test" ? "tested" : "saved") : "error");
      }
      if (result.ok) router.refresh();
      if (operation === "delete") {
        setDeleteError(!result.ok);
        if (result.ok) setDeleteId(null);
      }
    });
  };

  const columns: DataTableColumn<ProfileRow>[] = [
    { key: "profile", header: t("profile"), render: (row) => <div className={styles.profile}><span className={styles.icon}><HardDrive size={16} /></span><span><strong>{row.name}</strong><small>{row.provider === "s3" ? t("s3") : row.provider === "vercel_blob" ? t("vercelBlob") : t("filesystem")}</small></span></div> },
    { key: "destination", header: t("destination"), priority: "medium", render: (row) => <code className={styles.destination}>{destination(row)}</code> },
    { key: "usage", header: t("usage"), priority: "low", render: (row) => <span className={styles.usage}>{t("objects", { count: row.objectCount })}<small>{t("bytes", { count: row.storedBytes })}</small></span> },
    { key: "health", header: t("health"), render: (row) => <span className={styles.health}><Badge tone={row.status === "healthy" ? "success" : row.status === "unhealthy" ? "danger" : "neutral"}>{t(row.status)}</Badge>{row.lastCheckedAt && <small>{t("lastChecked", { date: `${row.lastCheckedAt.replace("T", " ").slice(0, 16)} UTC` })}</small>}</span> },
    { key: "state", header: t("state"), render: (row) => <div className={styles.badges}>{row.isDefault && <Badge tone="info">{t("default")}</Badge>}<Badge tone={row.enabled ? "success" : "neutral"}>{t(row.enabled ? "enabled" : "disabled")}</Badge></div> },
    { key: "actions", header: t("actions"), align: "end", render: (row) => <Menu label={`${t("actions")}: ${row.name}`}><MenuItem><Button size="sm" variant="ghost" onClick={() => run(row.id, "test")}>{t("test")}</Button></MenuItem>{!row.enabled && <MenuItem><Button size="sm" variant="ghost" onClick={() => run(row.id, "enable")} disabled={row.status !== "healthy"}>{t("enable")}</Button></MenuItem>}{row.enabled && !row.isDefault && <MenuItem><Button size="sm" variant="ghost" onClick={() => run(row.id, "disable")}>{t("disable")}</Button></MenuItem>}{row.enabled && !row.isDefault && <MenuItem><Button size="sm" variant="ghost" onClick={() => run(row.id, "default")} disabled={row.status !== "healthy"}>{t("setDefault")}</Button></MenuItem>}{!row.enabled && <MenuItem><Button size="sm" variant="ghost" onClick={() => { setProvider(row.provider); setFeedback(null); setDialog({ mode: "edit", profile: row }); }}>{t("edit")}</Button></MenuItem>}{!row.enabled && !row.isDefault && <MenuItem><Button size="sm" variant="ghost" onClick={() => { setDeleteError(false); setDeleteId(row.id); }}>{t("delete")}</Button></MenuItem>}</Menu> },
  ];

  const migrationColumns: DataTableColumn<MigrationRow>[] = [
    { key: "kind", header: t("migrationKind"), render: (row) => <strong>{migrationKind(t, row.kind)}</strong> },
    { key: "target", header: t("migrationTarget"), priority: "medium", render: (row) => row.targetProfileName ?? t("migrationNoTarget") },
    { key: "progress", header: t("migrationProgress"), render: (row) => <span className={styles.usage}>{t("migrationCounts", { processed: row.processedCount, migrated: row.migratedCount, failed: row.failedCount })}<small>{t("bytes", { count: row.totalBytes })}</small></span> },
    { key: "status", header: t("migrationStatus"), render: (row) => <Badge tone={row.status === "completed" ? "success" : row.status === "failed" || row.status === "completed_with_failures" ? "danger" : row.status === "running" ? "info" : "neutral"}>{migrationStatus(t, row.status)}</Badge> },
    { key: "updated", header: t("migrationUpdated"), priority: "low", render: (row) => <time dateTime={row.updatedAt}>{`${row.updatedAt.replace("T", " ").slice(0, 16)} UTC`}</time> },
  ];

  const editing = dialog?.mode === "edit" ? dialog.profile : null;
  const config = editing?.config as Record<string, unknown> | undefined;
  const providerOptions = [
    { value: "s3", label: t("s3") },
    { value: "vercel_blob", label: t("vercelBlob") },
    ...(allowFilesystem ? [{ value: "filesystem", label: t("filesystem") }] : []),
  ];

  return <>
    <div className={styles.toolbar}><div>{feedback === "saved" && <Notice tone="success">{t("saved")}</Notice>}{feedback === "tested" && <Notice tone="success">{t("tested")}</Notice>}{feedback === "error" && <Notice tone="danger">{t("actionFailed")}</Notice>}</div><Button variant="primary" onClick={() => { setProvider("s3"); setFeedback(null); setDialog({ mode: "create" }); }}><Plus size={16} />{t("create")}</Button></div>
    <DataTable columns={columns} rows={profiles} getRowKey={(row) => row.id} empty={<EmptyState icon={<HardDrive size={20} />} title={t("emptyTitle")} description={t("empty")} action={<Button variant="primary" onClick={() => { setProvider("s3"); setFeedback(null); setDialog({ mode: "create" }); }}><Plus size={16} />{t("create")}</Button>} />} />
    <section className={styles.migrations}>
      <div className={styles.sectionHeading}><div><h2>{t("migrationTitle")}</h2><p>{t("migrationDescription")}</p></div><Badge tone="info">{t("storageMode", { mode: storageMode })}</Badge></div>
      <DataTable columns={migrationColumns} rows={migrations} getRowKey={(row) => row.id} empty={<EmptyState title={t("migrationEmptyTitle")} description={t("migrationEmpty")} />} />
    </section>
    <Dialog open={!!dialog} title={editing ? t("editTitle") : t("createTitle")} description={editing ? t("secretReplaceHelp") : undefined} closeLabel={common("close")} onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>{common("cancel")}</Button><Button type="submit" form="storage-profile-form" variant="primary" loading={saving}>{common("save")}</Button></>}>
      {dialog && <form id="storage-profile-form" className={styles.form} onSubmit={(event) => { event.preventDefault(); if (saving) return; const data = new FormData(event.currentTarget); startSaving(async () => { const result = await saveAction(data); if (result.ok) { setDialog(null); setFeedback("saved"); router.refresh(); } else setFeedback("error"); }); }}>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <TextField name="name" label={t("name")} required maxLength={80} defaultValue={editing?.name} />
        <Select name="provider" label={t("provider")} value={provider} disabled={!!editing} options={providerOptions} onValueChange={(value) => setProvider(value as StorageProvider)} />
        {provider === "s3" && <><div className={styles.split}><TextField name="region" label={t("region")} required defaultValue={String(config?.region ?? "auto")} /><TextField name="bucket" label={t("bucket")} required defaultValue={String(config?.bucket ?? "")} /></div><TextField name="endpoint" type="url" label={t("endpoint")} help={t("endpointHelp")} defaultValue={String(config?.endpoint ?? "")} /><label className={styles.check}><input name="forcePathStyle" type="checkbox" defaultChecked={Boolean(config?.forcePathStyle)} />{t("forcePathStyle")}</label><TextField name="accessKeyId" label={t("accessKeyId")} required={!editing} autoComplete="off" /><TextField name="secretAccessKey" type="password" label={t("secretAccessKey")} required={!editing} autoComplete="new-password" /><TextField name="sessionToken" type="password" label={t("sessionToken")} autoComplete="new-password" /></>}
        {provider === "vercel_blob" && <TextField name="blobToken" type="password" label={t("blobToken")} required={!editing} autoComplete="new-password" />}
        {provider === "filesystem" && <TextField name="rootPath" label={t("rootPath")} required defaultValue={String(config?.rootPath ?? "")} />}
        {feedback === "error" && <Notice tone="danger">{t("saveFailed")}</Notice>}
      </form>}
    </Dialog>
    <ConfirmDialog open={!!deleteId} title={t("deleteTitle")} description={t("deleteConfirm")} confirmLabel={common("delete")} cancelLabel={common("cancel")} closeLabel={common("close")} danger busy={operating} error={deleteError ? t("actionFailed") : undefined} onClose={() => { setDeleteError(false); setDeleteId(null); }} onConfirm={() => { if (deleteId) run(deleteId, "delete"); }} />
  </>;
}
