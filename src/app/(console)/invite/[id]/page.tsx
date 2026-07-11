import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { InviteActions } from "@/app/_components/InviteActions";

type Props = { params: Promise<{ id: string }> };

export default async function InvitePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/invite/${id}`);
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 16 }}>
      <h1>Join organization</h1>
      <p style={{ opacity: 0.75 }}>
        You&apos;ve been invited to a Kiosk workspace. Accept to join, or decline.
      </p>
      <InviteActions invitationId={id} />
    </main>
  );
}
