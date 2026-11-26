import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { roleInOrg, resolveActiveOrg } from "@/lib/console";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "../_components/PageHeader";
import { MembersClient } from "./_components/MembersClient";

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/members");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);

  const full = await auth.api.getFullOrganization({ headers: await headers() });
  const members = full?.members ?? [];
  const invitations = (full?.invitations ?? []).filter(
    (i) => i.status === "pending",
  );
  const manage = !!role && can(role, "member.invite");
  const t = await getTranslations("members");
  return <><PageHeader title={t("title")} subtitle={t("subtitle")} /><MembersClient canManage={manage} currentUserId={session.user.id} members={members.map((member) => ({ id: member.id, userId: member.userId, name: member.user?.name ?? null, email: member.user?.email ?? member.userId, role: member.role, joinedAt: member.createdAt.toISOString() }))} invitations={invitations.map((invitation) => ({ id: invitation.id, email: invitation.email, role: invitation.role, createdAt: invitation.createdAt.toISOString() }))} /></>;
}
