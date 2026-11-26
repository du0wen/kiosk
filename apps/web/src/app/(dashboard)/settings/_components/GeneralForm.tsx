"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton, Notice, TextField } from "@/components/ui";
import styles from "./GeneralForm.module.css";

export type GeneralState = { ok: boolean | null; error?: "forbidden" | "invalid" | "failed" };
type Action = (prev: GeneralState, formData: FormData) => Promise<GeneralState>;

export function GeneralForm({ organizationId, organizationName, role, canEdit, action }: { organizationId: string; organizationName: string; role: string; canEdit: boolean; action: Action }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<GeneralState, FormData>(action, { ok: null });
  // Controlled so the user's edit survives React 19's automatic form reset
  // after a failed action. Org switch re-seeds it via the page-level key remount.
  const [name, setName] = useState(organizationName);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const errorText =
    state.error === "invalid" ? t("nameRequired")
    : state.error === "forbidden" ? t("forbidden")
    : state.error === "failed" ? t("saveFailed")
    : null;
  const roleLabel = common(role === "owner" ? "owner" : role === "admin" ? "admin" : "member");

  return (
    <div>
      {canEdit ? (
        <form action={formAction} className={styles.form}>
          <TextField name="name" label={t("organizationName")} value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          {state.ok === true && <Notice tone="success">{t("saved")}</Notice>}
          {errorText && <Notice tone="danger">{errorText}</Notice>}
          <Button variant="primary" type="submit" loading={pending}>
            <Check size={16} />
            {common("save")}
          </Button>
        </form>
      ) : (
        <div className={styles.form}>
          <dl className={styles.field}>
            <dt>{t("organizationName")}</dt>
            <dd><strong>{organizationName}</strong></dd>
          </dl>
          <Notice tone="info">{t("readOnly")}</Notice>
        </div>
      )}
      <dl className={styles.meta}>
        <div className={styles.field}>
          <dt>{t("organizationId")}</dt>
          <dd className={styles.idRow}>
            <code>{organizationId}</code>
            <IconButton
              label={copied ? common("copied") : t("copyId")}
              icon={copied ? <Check size={15} /> : <Clipboard size={15} />}
              onClick={async () => { await navigator.clipboard.writeText(organizationId); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
            />
          </dd>
        </div>
        <div className={styles.field}>
          <dt>{t("yourRole")}</dt>
          <dd>{roleLabel}</dd>
        </div>
      </dl>
    </div>
  );
}
