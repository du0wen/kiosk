import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LocaleSwitcher } from "@/app/_components/LocaleSwitcher";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings");
  return (
    <main
      style={{ maxWidth: 720, margin: "4vh auto", padding: 16, display: "grid", gap: 12 }}
    >
      <h1>Settings</h1>
      <p>{session.user.email}</p>
      <div>
        <LocaleSwitcher />
      </div>
      <p>
        <a href="/settings/tokens">API Tokens</a> · <a href="/pages">Pages</a>
      </p>
    </main>
  );
}
