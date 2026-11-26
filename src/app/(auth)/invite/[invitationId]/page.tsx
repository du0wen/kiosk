import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { MailOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { InviteActions } from "./_components/InviteActions";
import styles from "./page.module.css";

type Props = { params: Promise<{ invitationId: string }> };

export default async function InvitePage({ params }: Props) {
  const { invitationId: id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/invite/${id}`);
  const t = await getTranslations("invite");
  return (
    <div className={styles.content}>
      <span className={styles.icon}><MailOpen size={20} /></span>
      <h1>{t("title")}</h1>
      <p>{t("description")}</p>
      <InviteActions invitationId={id} />
    </div>
  );
}
