"use client";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Notice } from "./Notice";

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, closeLabel, danger = false, busy = false, error, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel: string; cancelLabel: string; closeLabel: string; danger?: boolean; busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void }) {
  return <Dialog open={open} title={title} description={description} closeLabel={closeLabel} onClose={onClose} footer={<><Button type="button" onClick={onClose}>{cancelLabel}</Button><Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>{error ? <Notice tone="danger">{error}</Notice> : undefined}</Dialog>;
}
