"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button, Notice } from "@/components/ui";
import styles from "./InviteActions.module.css";

export function InviteActions({ invitationId }: { invitationId: string }) {
  const router = useRouter(); const t = useTranslations("invite"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const act = async (kind: "accept" | "reject") => { setBusy(true); setError(null); const result = kind === "accept" ? await authClient.organization.acceptInvitation({ invitationId }) : await authClient.organization.rejectInvitation({ invitationId }); if (result.error) { setError(result.error.message ?? t("failed")); setBusy(false); return; } router.push("/pages"); };
  return <div className={styles.actions}><Button variant="primary" loading={busy} onClick={() => act("accept")}>{t("accept")}</Button><Button disabled={busy} onClick={() => act("reject")}>{t("decline")}</Button>{error && <Notice tone="danger">{error}</Notice>}</div>;
}
