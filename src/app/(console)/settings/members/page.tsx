import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { roleInOrg, resolveActiveOrg } from "@/lib/console";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { InviteForm } from "@/app/_components/InviteForm";
import { OrgControls } from "@/app/_components/OrgControls";
import { MemberRow } from "@/app/_components/MemberRow";

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/members");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);

  const full = await auth.api.getFullOrganization({ headers: await headers() });
  const members = full?.members ?? [];
  const invitations = (full?.invitations ?? []).filter(
    (i) => i.status === "pending",
  );
  const manage = !!role && can(role, "member.invite");

  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16 }}>
      <h1>Members</h1>
      <OrgControls />
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {members.map((m) => (
          <MemberRow
            key={m.id}
            memberId={m.id}
            email={m.user?.email ?? m.userId}
            role={m.role}
            manage={manage}
            isSelf={m.userId === session.user.id}
          />
        ))}
      </ul>
      {manage && <InviteForm />}
      {manage && invitations.length > 0 && (
        <>
          <h2 style={{ fontSize: 15 }}>Pending invitations</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {invitations.map((i) => (
              <li key={i.id} style={{ fontSize: 13, opacity: 0.8 }}>
                {i.email} — {i.role}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
