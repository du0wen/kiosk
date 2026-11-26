"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, KeyRound, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  IconButton,
  Notice,
  Select,
  TextField,
  type DataTableColumn,
} from "@/components/ui";
import { ALL_TOKEN_SCOPES, type TokenScope } from "@/lib/token-scopes";
import styles from "./TokensClient.module.css";

type TokenRow = {
  id: string;
  name: string;
  tokenFingerprint: string;
  scopes: TokenScope[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  creator: string;
};

// The plaintext arrives in the action *result* (over the action response
// channel) and lives only in component state — never a prop, URL, or storage.
export type TokenCreateState = {
  ok: boolean | null;
  token?: string;
  error?: "failed" | "invalid" | "quota";
};
type CreateAction = (data: FormData) => Promise<TokenCreateState>;
type RevokeAction = (data: FormData) => Promise<void>;

export function TokensClient({ tokens, createAction, revokeAction }: { tokens: TokenRow[]; createAction: CreateAction; revokeAction: RevokeAction }) {
  const t = useTranslations("tokens");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<{
    token?: string;
    error?: "failed" | "invalid" | "quota";
  }>({});
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, startCreate] = useTransition();

  // Reset any prior one-time value/error before starting a fresh create.
  const openCreate = () => { setCreated({}); setCreateOpen(true); };

  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const isExpired = (row: TokenRow) =>
    row.expiresAt !== null && new Date(row.expiresAt).getTime() <= Date.now();
  const columns: DataTableColumn<TokenRow>[] = [
    { key: "name", header: t("name"), render: (row) => <div className={styles.tokenName}><span className={styles.keyIcon}><KeyRound size={16} /></span><span><strong>{row.name}</strong><small>{t("fingerprint")}: <code>{row.tokenFingerprint}</code></small></span></div> },
    { key: "created", header: t("created"), priority: "medium", render: (row) => formatDate(row.createdAt) },
    { key: "lastUsed", header: t("lastUsed"), priority: "medium", render: (row) => row.lastUsedAt ? formatDate(row.lastUsedAt) : t("never") },
    { key: "scopes", header: t("scopes"), priority: "medium", render: (row) => <div className={styles.scopes}>{row.scopes.map((scope) => <Badge key={scope}>{t(`scope_${scope}`)}</Badge>)}</div> },
    { key: "expires", header: t("expires"), priority: "medium", render: (row) => row.expiresAt ? formatDate(row.expiresAt) : t("neverExpires") },
    { key: "creator", header: t("createdBy"), priority: "low", render: (row) => row.creator },
    { key: "status", header: t("status"), render: (row) => <Badge tone={row.revokedAt ? "neutral" : isExpired(row) ? "warning" : "success"}>{row.revokedAt ? t("revoked") : isExpired(row) ? t("expired") : common("active")}</Badge> },
    { key: "actions", header: t("actions"), align: "end", render: (row) => row.revokedAt ? null : <IconButton label={t("revoke")} icon={<Trash2 size={16} />} onClick={() => setRevokeId(row.id)} /> },
  ];

  return <>
    <div className={styles.toolbar}><Notice tone="warning">{t("securityNotice")}</Notice><Button variant="primary" onClick={openCreate}><Plus size={16} />{t("create")}</Button></div>
    {created.token && <Notice tone="success"><div className={styles.created}><div><strong>{t("shownOnce")}</strong><code>{created.token}</code></div><IconButton label={copied ? common("copied") : common("copy")} icon={copied ? <Check size={16} /> : <Clipboard size={16} />} onClick={async () => { await navigator.clipboard.writeText(created.token!); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} /></div></Notice>}
    <DataTable columns={columns} rows={tokens} getRowKey={(row) => row.id} empty={<EmptyState icon={<KeyRound size={20} />} title={t("emptyTitle")} description={t("empty")} action={<Button variant="primary" onClick={openCreate}><Plus size={16} />{t("create")}</Button>} />} />
    <Dialog open={createOpen} title={t("createTitle")} description={t("createDescription")} closeLabel={common("close")} onClose={() => setCreateOpen(false)} footer={<><Button onClick={() => setCreateOpen(false)}>{common("cancel")}</Button><Button type="submit" form="create-token" variant="primary" loading={creating} disabled={creating}>{t("create")}</Button></>}>
      <form
        id="create-token"
        className={styles.createForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (creating) return; // guard against double submit while pending
          const data = new FormData(event.currentTarget);
          startCreate(async () => {
            const result = await createAction(data);
            if (result.ok && result.token) {
              setCreated({ token: result.token });
              setCreateOpen(false);
              router.refresh();
            } else {
              setCreated({ error: "failed" });
            }
          });
        }}
      >
        <TextField name="name" label={t("name")} required minLength={2} maxLength={80} autoFocus />
        <fieldset className={styles.scopeFieldset}>
          <legend>{t("scopes")}</legend>
          <p>{t("scopesHelp")}</p>
          <div className={styles.scopeOptions}>
            {ALL_TOKEN_SCOPES.map((scope) => (
              <label key={scope}>
                <input type="checkbox" name="scopes" value={scope} defaultChecked />
                <span><strong>{t(`scope_${scope}`)}</strong><small>{t(`scope_${scope}_help`)}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Select
          name="expiresInDays"
          label={t("expiration")}
          defaultValue="90"
          options={[
            { value: "30", label: t("expires30") },
            { value: "90", label: t("expires90") },
            { value: "365", label: t("expires365") },
            { value: "never", label: t("neverExpires") },
          ]}
        />
        {created.error && <Notice tone="danger">{t(created.error === "quota" ? "quotaExceeded" : created.error === "invalid" ? "invalidCreate" : "createFailed")}</Notice>}
      </form>
    </Dialog>
    <ConfirmDialog open={!!revokeId} title={t("revoke")} description={t("revokeConfirm")} confirmLabel={t("revoke")} cancelLabel={common("cancel")} closeLabel={common("close")} danger busy={pending} onClose={() => setRevokeId(null)} onConfirm={() => { if (!revokeId) return; startTransition(async () => { const data = new FormData(); data.set("id", revokeId); await revokeAction(data); setRevokeId(null); router.refresh(); }); }} />
  </>;
}
