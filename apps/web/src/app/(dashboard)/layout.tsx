import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isAdminEmail, resolveActiveOrg } from "@/lib/console";
import { getOrgBranding } from "@/lib/org-settings";
import { isSetupCompletedLive } from "@/lib/setup/config-file";
import { DashboardShell } from "./_components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupCompletedLive())) {
    redirect("/setup");
  }
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const organizationId = await resolveActiveOrg(session);
  if (!organizationId) redirect("/sign-in");
  const branding = await getOrgBranding(organizationId);
  return <DashboardShell activeOrganizationId={organizationId} organizationName={branding.name ?? "Kiosk"} userName={session.user.name ?? session.user.email} userEmail={session.user.email} platformAdmin={isAdminEmail(session.user.email)}>{children}</DashboardShell>;
}
