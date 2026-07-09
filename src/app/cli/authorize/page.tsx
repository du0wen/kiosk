import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createCliAuthCode } from "@/lib/cli-auth";

export default async function CliAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; state?: string }>;
}) {
  const { redirect_uri, state } = await searchParams;
  const session = await getSession();
  if (!session) {
    const back = `/cli/authorize?redirect_uri=${encodeURIComponent(redirect_uri ?? "")}&state=${encodeURIComponent(state ?? "")}`;
    redirect(`/sign-in?callback=${encodeURIComponent(back)}`);
  }

  async function authorize() {
    "use server";
    const s = await getSession();
    if (!s) throw new Error("Not authenticated");
    if (!redirect_uri) throw new Error("Missing redirect_uri");
    const code = await createCliAuthCode({
      userId: s.user.id,
      redirectUri: redirect_uri,
    });
    redirect(
      `${redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state ?? "")}`,
    );
  }

  return (
    <main style={{ maxWidth: 380, margin: "10vh auto", display: "grid", gap: 16 }}>
      <h1>Authorize the Kiosk CLI</h1>
      <p>
        Signed in as {session!.user.email}. Approve to log in the CLI on this
        device.
      </p>
      <form action={authorize}>
        <button type="submit">Authorize</button>
      </form>
    </main>
  );
}
