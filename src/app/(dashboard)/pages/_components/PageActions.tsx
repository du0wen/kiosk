"use client";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, History, Pencil, Share2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, ConfirmDialog, Dialog, IconButton, Menu, MenuItem, Notice, TextField } from "@/components/ui";
import type { ActionResult } from "../_lib/page-actions";
import { dashboardPath } from "../../_lib/paths";
import styles from "./PageActions.module.css";

type Action = (data: FormData) => Promise<ActionResult>;
type Format = "md" | "html" | "pdf" | "png" | "jpeg";
type ActionError = Extract<ActionResult, { ok: false }>["error"];
type Failure = { kind: "rename" | "visibility" | "delete"; code: ActionError };

/**
 * Row/detail action menu. Capability props decide which mutating items render
 * (owner/admin: any page; member: rename any, visibility/delete own only) — the
 * server re-checks all the same, so hidden items are convenience, not security.
 * A dialog/refresh/redirect only happens on `{ ok: true }`; failures surface via
 * the shared Notice (in the relevant dialog, or a small one for the toggle).
 */
export function PageActions({
  publicId, title, url, visibility,
  canRename, canSetVisibility, canDelete,
  renameAction, deleteAction, visibilityAction, deleteRedirect,
}: {
  publicId: string; title: string; url: string; visibility: string;
  canRename: boolean; canSetVisibility: boolean; canDelete: boolean;
  renameAction: Action; deleteAction: Action; visibilityAction: Action; deleteRedirect?: string;
}) {
  const t = useTranslations("pages"); const common = useTranslations("common"); const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const errorText = (code: ActionError) =>
    code === "forbidden" ? t("errorForbidden")
    : code === "not_found" ? t("errorNotFound")
    : t("errorGeneric");

  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };

  // Each handler acts only on `{ ok: true }`. A returned error, or an
  // unexpected rejection (transport/serialization), falls back to the generic
  // error via the same Notice — never a silent close/refresh/navigate.
  const toggleVisibility = () => startTransition(async () => {
    const data = new FormData(); data.set("id", publicId); data.set("to", visibility === "public" ? "org" : "public");
    try {
      const result = await visibilityAction(data);
      if (result.ok) router.refresh();
      else setError({ kind: "visibility", code: result.error });
    } catch {
      setError({ kind: "visibility", code: "internal_error" });
    }
  });

  const confirmDelete = () => startTransition(async () => {
    const data = new FormData(); data.set("id", publicId);
    try {
      const result = await deleteAction(data);
      if (!result.ok) { setError({ kind: "delete", code: result.error }); return; }
      setDeleteOpen(false);
      if (deleteRedirect) router.push(deleteRedirect as Route); else router.refresh();
    } catch {
      setError({ kind: "delete", code: "internal_error" });
    }
  });

  const submitRename = (form: HTMLFormElement) => startTransition(async () => {
    const data = new FormData(form);
    try {
      const result = await renameAction(data);
      if (!result.ok) { setError({ kind: "rename", code: result.error }); return; }
      setRenameOpen(false); router.refresh();
    } catch {
      setError({ kind: "rename", code: "internal_error" });
    }
  });

  return (
    <div className={styles.actions}>
      <IconButton className={styles.desktopAction} label={copied ? t("copied") : t("copy")} icon={<Copy size={16} />} onClick={copy} />
      <IconButton className={styles.desktopAction} label={t("open")} icon={<ExternalLink size={16} />} onClick={() => window.open(url, "_blank", "noopener,noreferrer")} />
      <Menu label={common("more")}>
        <div className={styles.mobileMenu}>
          <MenuItem><Button variant="ghost" size="sm" onClick={copy}><Copy size={15} />{t("copy")}</Button></MenuItem>
          <MenuItem><Button variant="ghost" size="sm" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />{t("open")}</Button></MenuItem>
        </div>
        {canRename && <MenuItem><Button variant="ghost" size="sm" onClick={() => { setError(null); setRenameOpen(true); }}><Pencil size={15} />{t("rename")}</Button></MenuItem>}
        {canSetVisibility && <MenuItem><Button variant="ghost" size="sm" onClick={toggleVisibility}><Share2 size={15} />{visibility === "public" ? t("makePrivate") : t("makePublic")}</Button></MenuItem>}
        <MenuItem><a className={styles.menuLink} href={dashboardPath.pageHistory(publicId)}><History size={15} />{t("history")}</a></MenuItem>
        <div className={styles.exports}>{(["md", "html", "pdf", "png", "jpeg"] as Format[]).map((format) => <a key={format} href={dashboardPath.pageExport(publicId, format)}>{format.toUpperCase()}</a>)}</div>
        {canDelete && <MenuItem><Button variant="ghost" size="sm" className={styles.delete} onClick={() => { setError(null); setDeleteOpen(true); }}><Trash2 size={15} />{t("delete")}</Button></MenuItem>}
      </Menu>
      <Dialog open={renameOpen} title={t("rename")} closeLabel={common("close")} onClose={() => setRenameOpen(false)} footer={<><Button onClick={() => setRenameOpen(false)}>{common("cancel")}</Button><Button type="submit" form={`rename-${publicId}`} variant="primary" loading={pending}>{common("save")}</Button></>}>
        <form id={`rename-${publicId}`} onSubmit={(event) => { event.preventDefault(); submitRename(event.currentTarget); }}>
          <input type="hidden" name="id" value={publicId} />
          <TextField name="title" label={t("rename")} defaultValue={title} required />
          {error?.kind === "rename" && <Notice tone="danger">{errorText(error.code)}</Notice>}
        </form>
      </Dialog>
      <ConfirmDialog open={deleteOpen} title={t("delete")} description={t("confirmDelete")} confirmLabel={t("delete")} cancelLabel={common("cancel")} closeLabel={common("close")} danger busy={pending} error={error?.kind === "delete" ? errorText(error.code) : undefined} onClose={() => setDeleteOpen(false)} onConfirm={confirmDelete} />
      <Dialog open={error?.kind === "visibility"} title={t("visibility")} closeLabel={common("close")} onClose={() => setError(null)} footer={<Button onClick={() => setError(null)}>{common("close")}</Button>}>
        {error?.kind === "visibility" ? <Notice tone="danger">{errorText(error.code)}</Notice> : undefined}
      </Dialog>
    </div>
  );
}
