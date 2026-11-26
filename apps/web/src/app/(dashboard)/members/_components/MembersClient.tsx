"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, Mail, Plus, Trash2, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Badge, Button, ConfirmDialog, DataTable, Dialog, EmptyState, IconButton, Notice, Select, TextField, type DataTableColumn } from "@/components/ui";
import { memberInitials } from "../_lib/member-label";
import styles from "./MembersClient.module.css";

type MemberRow = { id: string; userId: string; name: string | null; email: string; role: string; joinedAt: string };
type InvitationRow = { id: string; email: string; role: string | null; createdAt: string };

export function MembersClient({ members, invitations, canManage, currentUserId }: { members: MemberRow[]; invitations: InvitationRow[]; canManage: boolean; currentUserId: string }) {
  const t = useTranslations("members"); const common = useTranslations("common"); const locale = useLocale(); const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const changeRole = async (memberId: string, nextRole: string) => {
    setRoleBusyId(memberId); setRoleError(null);
    try {
      const result = await authClient.organization.updateMemberRole({ memberId, role: nextRole });
      if (result?.error) { setRoleError(t("updateRoleFailed")); return; }
      router.refresh();
    } catch { setRoleError(t("updateRoleFailed")); }
    finally { setRoleBusyId(null); }
  };
  const columns: DataTableColumn<MemberRow>[] = [
    { key: "member", header: t("member"), render: (row) => <div className={styles.person}><span>{memberInitials(row.name, row.email)}</span><div><strong>{row.name || row.email}</strong><small>{row.email}</small></div></div> },
    { key: "role", header: t("role"), render: (row) => canManage && row.role !== "owner" && row.userId !== currentUserId ? <select className={styles.roleSelect} value={row.role} disabled={roleBusyId === row.id} aria-label={t("changeRole")} onChange={(event) => changeRole(row.id, event.target.value)}><option value="member">{common("member")}</option><option value="admin">{common("admin")}</option></select> : <Badge tone={row.role === "owner" ? "success" : "neutral"}>{common(row.role === "owner" ? "owner" : row.role === "admin" ? "admin" : "member")}</Badge> },
    { key: "joined", header: t("joined"), priority: "medium", render: (row) => formatDate(row.joinedAt) },
    { key: "status", header: t("status"), priority: "low", render: () => <Badge tone="success">{common("active")}</Badge> },
    { key: "actions", header: t("actions"), align: "end", render: (row) => canManage && row.role !== "owner" && row.userId !== currentUserId ? <IconButton label={common("remove")} icon={<Trash2 size={16} />} onClick={() => setRemoveId(row.id)} /> : null },
  ];
  const invite = async () => {
    if (inviteBusy) return;
    setInviteBusy(true); setError(null); setLink(null);
    try {
      const result = await authClient.organization.inviteMember({ email, role });
      if (result.error || !result.data) { setError(result.error?.message ?? t("inviteFailed")); return; }
      setLink(`${window.location.origin}/invite/${result.data.id}`); setEmail(""); router.refresh();
    } finally { setInviteBusy(false); }
  };
  return <>
    {roleError && <Notice tone="danger">{roleError}</Notice>}
    <div className={styles.toolbar}><span>{t("total")}: <strong>{members.length}</strong></span>{canManage && <Button variant="primary" onClick={() => setInviteOpen(true)}><Plus size={16} />{t("invite")}</Button>}</div>
    <DataTable columns={columns} rows={members} getRowKey={(row) => row.id} empty={<EmptyState icon={<Users size={20} />} title={t("title")} description={common("empty")} />} />
    <section className={styles.pending}><div><h2>{t("pendingInvitations")}</h2><p>{t("pendingSubtitle")}</p></div>{invitations.length ? <div className={styles.invites}>{invitations.map((invitation) => <div key={invitation.id}><span className={styles.mail}><Mail size={16} /></span><span><strong>{invitation.email}</strong><small>{common(invitation.role === "admin" ? "admin" : "member")} · {formatDate(invitation.createdAt)}</small></span><Badge tone="warning">{t("pendingStatus")}</Badge></div>)}</div> : <p className={styles.noPending}>{t("noPending")}</p>}</section>
    <Dialog open={inviteOpen} title={t("invite")} closeLabel={common("close")} onClose={() => { setInviteOpen(false); setLink(null); setError(null); }} footer={!link ? <><Button type="button" onClick={() => setInviteOpen(false)}>{common("cancel")}</Button><Button type="submit" form="invite-form" variant="primary" loading={inviteBusy}>{t("createLink")}</Button></> : <Button variant="primary" onClick={() => setInviteOpen(false)}>{common("close")}</Button>}>{link ? <div className={styles.inviteForm}><Notice tone="success"><div className={styles.link}><span><strong>{t("shareLink")}</strong><code>{link}</code></span><IconButton label={copied ? common("copied") : common("copy")} icon={copied ? <Check size={16} /> : <Clipboard size={16} />} onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }} /></div></Notice></div> : <form id="invite-form" className={styles.inviteForm} onSubmit={(event) => { event.preventDefault(); invite(); }}><TextField type="email" label={t("email")} value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /><Select label={t("role")} value={role} onValueChange={(value) => setRole(value as "member" | "admin")} options={[{ value: "member", label: common("member") }, { value: "admin", label: common("admin") }]} />{error && <Notice tone="danger">{error}</Notice>}</form>}</Dialog>
    <ConfirmDialog open={!!removeId} title={common("remove")} description={t("removeConfirm")} confirmLabel={common("remove")} cancelLabel={common("cancel")} closeLabel={common("close")} danger busy={removeBusy} error={removeError ?? undefined} onClose={() => { setRemoveId(null); setRemoveError(null); }} onConfirm={async () => {
      if (!removeId) return;
      setRemoveBusy(true); setRemoveError(null);
      try {
        const result = await authClient.organization.removeMember({ memberIdOrEmail: removeId });
        if (result?.error) { setRemoveError(t("removeFailed")); return; }
        setRemoveId(null); router.refresh();
      } catch { setRemoveError(t("removeFailed")); }
      finally { setRemoveBusy(false); }
    }} />
  </>;
}
